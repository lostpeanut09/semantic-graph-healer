import { App, TFile } from 'obsidian';
import { DirectedGraph } from 'graphology';
import pagerank from 'graphology-metrics/centrality/pagerank';
// louvain: Refactored to Web Worker
// betweennessCentrality: Refactored to Web Worker
import { Suggestion, SemanticGraphHealerSettings, TopologicalMetrics } from '../types';
import { HealerLogger } from './HealerUtils';
import { LinkPredictionEngine } from './LinkPredictionEngine';

import type { GraphContext } from './services/PluginContext';

/** Node attributes for the graphology DirectedGraph */
interface GraphNodeAttributes {
    label: string;
    size: number;
}

export class GraphEngine {
    private graph: DirectedGraph;
    private graphVersionNum = 0;
    private predictionEngine: LinkPredictionEngine;
    private readonly linkContextPath = '';

    constructor(private context: GraphContext) {
        this.graph = new DirectedGraph();
        this.predictionEngine = new LinkPredictionEngine(context);
    }

    private get app(): App {
        return this.context.app;
    }

    private get settings(): SemanticGraphHealerSettings {
        return this.context.settings;
    }

    private get cache(): TopologicalMetrics {
        return this.context.cache.topologicalScores;
    }

    private set cache(value: TopologicalMetrics) {
        this.context.cache.topologicalScores = value;
        this.context.cache.save();
    }

    /**
     * ✅ NEW: Explicit memory management for large graphs.
     */
    public dispose() {
        this.graph.clear();
        HealerLogger.info('GraphEngine disposed, memory released.');
    }

    /**
     * Force clearing of the topological cache.
     */
    public clearTopologicalCache() {
        this.cache = {
            pageRank: {},
            betweenness: {},
            communities: {},
            lastAnalysisTimestamp: 0,
            graphVersion: '',
        };
        HealerLogger.info('Topological cache cleared.');
    }

    /**
     * ✅ NEW: Cache status reporting for UI synchronization.
     */
    public getCacheStatus() {
        return {
            valid: this.isCacheValid(),
            version: this.graphVersionNum,
            nodes: this.graph.order,
            edges: this.graph.size,
        };
    }

    private isCacheValid(): boolean {
        const c = this.cache;
        if (!c.graphVersion || c.graphVersion !== this.getGraphFingerprint()) return false;
        // Expire after 1 hour
        if (Date.now() - c.lastAnalysisTimestamp > 3600000) return false;
        return true;
    }

    private getGraphFingerprint(): string {
        return `${this.graph.order}:${this.graph.size}:${this.graphVersionNum}`;
    }

    /**
     * Builds the graph in memory using Obsidian's cache.
     * Uses Weighted DirectedGraph for SOTA accuracy with memory guardrails (2026).
     */
    public buildGraph() {
        this.graph.clear();
        const resolvedLinks = this.app.metadataCache.resolvedLinks;

        // ✅ MEMORY GUARDRAILS
        const useGuardrails = this.settings.enableGraphGuardrails ?? true;
        const maxNodes = this.settings.maxNodes || 5000;
        const maxEdges = this.settings.maxEdges || 50000;

        // 1. Add Nodes (with guardrails)
        const files = this.app.vault.getMarkdownFiles();
        if (useGuardrails && files.length > maxNodes) {
            HealerLogger.warn(
                `Vault size (${files.length} nodes) exceeds guardrail (${maxNodes}). Capping graph construction.`,
            );
        }

        let nodeCount = 0;
        for (const f of files) {
            if (useGuardrails && nodeCount >= maxNodes) break;
            if (!this.graph.hasNode(f.path)) {
                this.graph.addNode(f.path, {
                    label: f.basename,
                    size: f.stat.size,
                } as GraphNodeAttributes);
                nodeCount++;
            }
        }

        // 2. Add Typed and Weighted Edges (with guardrails)
        let edgeCount = 0;
        for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
            if (!this.graph.hasNode(sourcePath)) continue;
            if (useGuardrails && edgeCount >= maxEdges) break;

            const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
            const frontmatterLinks: Record<string, string[]> = {};
            if (sourceFile instanceof TFile) {
                const cache = this.app.metadataCache.getFileCache(sourceFile);
                if (cache?.frontmatterLinks) {
                    for (const flink of cache.frontmatterLinks) {
                        if (!frontmatterLinks[flink.key]) {
                            frontmatterLinks[flink.key] = [];
                        }
                        const targetDest = this.app.metadataCache.getFirstLinkpathDest(flink.link, sourcePath)?.path;
                        if (targetDest) {
                            frontmatterLinks[flink.key].push(targetDest);
                        }
                    }
                }
            }

            for (const [targetPath, rawCount] of Object.entries(targets)) {
                if (useGuardrails && edgeCount >= maxEdges) break;
                if (!this.graph.hasNode(targetPath)) continue;
                if (sourcePath === targetPath) continue;

                let edgeType = 'related'; // default
                for (const [key, paths] of Object.entries(frontmatterLinks)) {
                    if (paths.includes(targetPath)) {
                        for (const h of this.settings.hierarchies) {
                            if (h.up?.includes(key)) edgeType = 'up';
                            else if (h.down?.includes(key)) edgeType = 'down';
                            else if (h.next?.includes(key)) edgeType = 'next';
                            else if (h.prev?.includes(key)) edgeType = 'prev';
                            else if (h.same?.includes(key)) edgeType = 'same';
                            if (edgeType !== 'related') break;
                        }
                    }
                    if (edgeType !== 'related') break;
                }

                const count = Number(rawCount ?? 1);
                const weight = Math.log1p(count);

                if (this.graph.hasEdge(sourcePath, targetPath)) {
                    const prev = this.graph.getEdgeAttribute(sourcePath, targetPath, 'weight') as number;
                    this.graph.setEdgeAttribute(sourcePath, targetPath, 'weight', prev + weight);
                    if (edgeType !== 'related') {
                        this.graph.setEdgeAttribute(sourcePath, targetPath, 'type', edgeType);
                    }
                } else {
                    this.graph.addEdge(sourcePath, targetPath, { weight, type: edgeType });
                    edgeCount++;
                }
            }
        }

        this.graphVersionNum++;
        HealerLogger.info(`Graph built: ${this.graph.order} nodes, ${this.graph.size} edges.`);

        if (useGuardrails && (nodeCount >= maxNodes || edgeCount >= maxEdges)) {
            HealerLogger.warn('Graph construction hit memory guardrails. Some nodes/edges were omitted.');
        }
    }

    /**
     * PageRank analysis with weight support (Async via Web Worker).
     */
    public async runPageRankAnalysis(): Promise<Suggestion[]> {
        HealerLogger.info('Running Weighted PageRank (Log-Transformed) in background worker...');

        if (this.isCacheValid() && Object.keys(this.cache.pageRank).length > 0) {
            HealerLogger.info('Using cached PageRank scores.');
            return this.processScores(this.cache.pageRank, 'pagerank_auth', 'PageRank authority (cached)');
        }

        // SOTA 2026: Proactive Fallback for fragmented graphs
        const isolatedNodes = this.graph.nodes().filter((n) => this.graph.degree(n) === 0).length;
        const isolatedRatio = isolatedNodes / (this.graph.order || 1);

        if (isolatedRatio > 0.3) {
            HealerLogger.warn(
                `Vault graph is highly fragmented (${(isolatedRatio * 100).toFixed(1)}% isolated nodes). Skipping PageRank for stable Degree Centrality.`,
            );
            return this.runDegreeCentralityFallback();
        }

        try {
            const nodes = this.getSerializedNodes();
            const edges = this.getSerializedEdges();
            const worker = this.context.graphWorkerService;
            const scores = await worker.runAnalysis<Record<string, number>>('PAGERANK', nodes, edges, {
                getEdgeWeight: 'weight',
                alpha: 0.85,
                maxIterations: 200,
                tolerance: 1e-6,
            });

            this.cache = {
                ...this.cache,
                pageRank: scores,
                lastAnalysisTimestamp: Date.now(),
                graphVersion: this.getGraphFingerprint(),
            };
            return this.processScores(scores, 'pagerank_auth', 'PageRank authority (log-weighted)');
        } catch (e) {
            HealerLogger.warn('Background PageRank failed. Falling back to sync total degree.', e);
            return this.runDegreeCentralityFallback();
        }
    }

    private runDegreeCentralityFallback(): Suggestion[] {
        const scores: Record<string, number> = {};
        this.graph.forEachNode((node) => {
            let totalWeight = 0;
            this.graph.forEachEdge(node, (edge) => {
                totalWeight += (this.graph.getEdgeAttribute(edge, 'weight') as number) || 0;
            });
            scores[node] = totalWeight;
        });
        return this.processScores(scores, 'degree_centrality', 'Weighted Node Degree (In+Out)');
    }

    private processScores(scores: Record<string, number>, idPrefix: string, method: string): Suggestion[] {
        const suggestions: Suggestion[] = [];
        const sorted = Object.entries(scores)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 15);

        const maxScore = sorted[0]?.[1] || 1;

        sorted.forEach(([path, score]) => {
            const normalized = score / maxScore;
            if (normalized < 0.1) return;

            const file = this.app.vault.getAbstractFileByPath(path);
            const link = this.pathToLink(path);

            suggestions.push({
                id: `${idPrefix}:${path}`,
                type: 'quality',
                link: link,
                source: `Graph Analysis (${method}): Recognized as high-influence node (Normalized Score: ${normalized.toFixed(2)}).`,
                timestamp: Date.now(),
                category: 'info',
                meta: {
                    confidence: Math.round(normalized * 100),
                    sourceNote: file instanceof TFile ? file.basename : path,
                    description: `This note is a structural ${idPrefix.includes('pagerank') ? 'authority' : 'hub'} in your graph.`,
                },
            });
        });

        return suggestions;
    }

    /**
     * Louvain Community Detection with weight support (Worker-Delegate).
     * SOTA 2026: Async processing to prevent UI lockup in large graphs.
     */
    public async runCommunityDetection(): Promise<Suggestion[]> {
        HealerLogger.info('Running Weighted Louvain Clustering (Worker)...');

        if (this.isCacheValid() && Object.keys(this.cache.communities).length > 0) {
            HealerLogger.info('Using cached community data.');
            return this.processCommunities(this.cache.communities);
        }

        try {
            const nodes = this.getSerializedNodes();
            const edges = this.getSerializedEdges();
            const worker = this.context.graphWorkerService;
            const communities = await worker.runAnalysis<Record<string, number>>('COMMUNITY', nodes, edges, {
                getEdgeWeight: 'weight',
            });

            if (!communities) return [];

            this.cache = {
                ...this.cache,
                communities,
                lastAnalysisTimestamp: Date.now(),
                graphVersion: this.getGraphFingerprint(),
            };

            return this.processCommunities(communities);
        } catch (e) {
            HealerLogger.error('Community detection failed in worker', e);
            return [];
        }
    }

    private processCommunities(communities: Record<string, number>): Suggestion[] {
        const suggestions: Suggestion[] = [];
        const isCacheValid = this.isCacheValid() && Object.keys(this.cache.pageRank).length > 0;

        const prScores = isCacheValid
            ? this.cache.pageRank
            : pagerank(this.graph, {
                  getEdgeWeight: 'weight',
                  alpha: 0.85,
                  maxIterations: 100,
              });

        const clusters: Record<string, string[]> = {};
        Object.entries(communities).forEach(([path, commId]) => {
            const id = String(commId);
            if (!clusters[id]) clusters[id] = [];
            clusters[id].push(path);
        });

        const saturationThreshold = this.settings.mocSaturationThreshold || 20;

        Object.entries(clusters).forEach(([commId, paths]) => {
            if (paths.length < 5) return;

            const sortedPaths = paths.sort((a, b) => (prScores[b] || 0) - (prScores[a] || 0));
            const representativePath = sortedPaths[0];
            const file = this.app.vault.getAbstractFileByPath(representativePath);
            if (!(file instanceof TFile)) return;

            const link = this.pathToLink(representativePath);

            // 1. Basic Cluster Info
            suggestions.push({
                id: `cluster:${commId}:${representativePath}`,
                type: 'quality',
                link: link,
                source: `Thematic Cluster #${commId} detected (${paths.length} notes).`,
                timestamp: Date.now(),
                category: 'info',
                meta: {
                    confidence: 70,
                    sourceNote: file.basename,
                    description: `Conceptual group centered around ${file.basename}.`,
                },
            });

            // 2. MOC Suggestion (if cluster is large and saturated)
            if (paths.length >= saturationThreshold) {
                // Check if any note in the cluster is already an MOC
                const hasExistingMoc = paths.some((p) => {
                    const f = this.app.vault.getAbstractFileByPath(p);
                    if (!(f instanceof TFile)) return false;
                    const basename = f.basename || '';
                    const name = f.name || '';
                    return (
                        basename.toLowerCase().includes('moc') ||
                        name.toLowerCase().includes('moc') ||
                        (this.app.metadataCache.getFileCache(f)?.tags || []).some((t) =>
                            t.tag.toLowerCase().includes('moc'),
                        )
                    );
                });

                if (!hasExistingMoc) {
                    suggestions.push({
                        id: `moc_suggestion:${commId}`,
                        type: 'quality',
                        link: link,
                        source: `Structural Gap: Large conceptual cluster (${paths.length} notes) lacks a dedicated Map of Content (MOC).`,
                        timestamp: Date.now(),
                        category: 'suggestion',
                        meta: {
                            confidence: 85,
                            sourcePath: representativePath,
                            sourceNote: file.basename,
                            description: `Suggest creating 'MOC: ${file.basename} Cluster' to organize these notes.`,
                            winner: `MOC: ${file.basename} Cluster`,
                            losers: sortedPaths.slice(0, 5), // Top 5 members
                        },
                    });
                }
            }
        });

        return suggestions;
    }

    /**
     * Weighted Betweenness Centrality (Bridges) - Worker-Delegate.
     * SOTA 2026: No longer requires sync guardrails as it runs in background.
     */
    public async runBetweennessAnalysis(): Promise<Suggestion[]> {
        HealerLogger.info('Running Weighted Betweenness Centrality (Worker Bridges)...');

        if (this.isCacheValid() && Object.keys(this.cache.betweenness).length > 0) {
            HealerLogger.info('Using cached betweenness scores.');
            return this.processBetweenness(this.cache.betweenness);
        }

        try {
            const nodes = this.getSerializedNodes();
            const edges = this.getSerializedEdges();
            const worker = this.context.graphWorkerService;
            const scores = await worker.runAnalysis<Record<string, number>>('BETWEENNESS', nodes, edges, {
                getEdgeWeight: 'weight',
            });

            if (!scores) return [];

            this.cache = {
                ...this.cache,
                betweenness: scores,
                lastAnalysisTimestamp: Date.now(),
                graphVersion: this.getGraphFingerprint(),
            };

            return this.processBetweenness(scores);
        } catch (e) {
            HealerLogger.error('Betweenness Centrality failed in worker', e);
            return [];
        }
    }

    private processBetweenness(scores: Record<string, number>): Suggestion[] {
        const suggestions: Suggestion[] = [];
        const sorted = Object.entries(scores)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10);

        sorted.forEach(([path, score]) => {
            if (score <= 0) return;

            const file = this.app.vault.getAbstractFileByPath(path);
            const link = this.pathToLink(path);

            suggestions.push({
                id: `betweenness_bridge:${path}`,
                type: 'quality',
                link: link,
                source: `Critical Bridge Detected (Betweenness: ${score.toFixed(2)}). Connects disparate topics.`,
                timestamp: Date.now(),
                category: 'info',
                meta: {
                    description: 'Key connectivity node bridging different clusters (weighted).',
                    confidence: 85,
                    sourceNote: file instanceof TFile ? file.basename : path,
                },
            });
        });

        return suggestions;
    }

    /**
     * ✅ NEW: Co-citation Analysis — 2nd-order backlinks.
     * Async via Worker to handle O(N^2) complexity in large vaults.
     */
    public async runCoCitationAnalysis(minScore = 2, limit = 15): Promise<Suggestion[]> {
        HealerLogger.info('Running Co-Citation Analysis (Worker offloaded)...');

        // Serialization Guard
        if (this.graph.order < 100) {
            return this.runCoCitationAnalysisSync(minScore, limit);
        }

        try {
            const nodes = this.getSerializedNodes();
            const edges = this.getSerializedEdges();
            const worker = this.context.graphWorkerService;

            const results = await worker.runAnalysis<Array<{ a: string; b: string; score: number }>>(
                'COCITATION',
                nodes,
                edges,
                { minScore },
            );

            if (!results) return [];

            const suggestions: Suggestion[] = [];
            const sorted = results.sort((a, b) => b.score - a.score).slice(0, limit);

            for (const { a, b, score } of sorted) {
                const fileA = this.app.vault.getAbstractFileByPath(a);
                const fileB = this.app.vault.getAbstractFileByPath(b);
                if (!(fileA instanceof TFile) || !(fileB instanceof TFile)) continue;

                suggestions.push({
                    id: `cocitation:${[a, b].sort().join('::')}`,
                    type: 'deterministic',
                    link: `[[${fileB.basename}]]`,
                    source: `Co-Citation (score: ${score}): [[${fileA.basename}]] and [[${fileB.basename}]] are cited together in ${score} note(s).`,
                    timestamp: Date.now(),
                    category: 'suggestion',
                    meta: {
                        property: 'related',
                        sourcePath: a,
                        targetPath: b,
                        sourceNote: fileA.basename,
                        targetNote: fileB.basename,
                        description: `Implied relationship via ${score} shared citation source(s)`,
                        confidence: Math.min(Math.round(score * 15), 95),
                    },
                });
            }

            HealerLogger.info(`Co-Citation: ${suggestions.length} implicit links discovered via worker.`);
            return suggestions;
        } catch (e) {
            HealerLogger.error('Co-citation analysis failed in worker, falling back to sync.', e);
            return this.runCoCitationAnalysisSync(minScore, limit);
        }
    }

    /**
     * ✅ NEW: Similarity Analysis (Jaccard, AA, RA).
     * Async via Worker with Candidate Generation (O(E) instead of O(V^2)).
     */
    public async runSimilarityAnalysis(options?: { limit?: number }): Promise<Suggestion[]> {
        HealerLogger.info('Running Deep Topology Similarity Analysis (Engine-delegated)...');

        try {
            const nodes = this.getSerializedNodes();
            const edges = this.getSerializedEdges();

            return await this.predictionEngine.predictLinks(nodes, edges, options);
        } catch (e) {
            HealerLogger.error('Similarity analysis failed in engine delegation.', e);
            return [];
        }
    }

    private getFileStats(): Record<string, { mtime: number }> {
        const stats: Record<string, { mtime: number }> = {};
        this.app.vault.getMarkdownFiles().forEach((f) => {
            stats[f.path] = { mtime: f.stat.mtime };
        });
        return stats;
    }

    private getSerializedNodes() {
        const nodes: Array<{ key: string; attributes: Record<string, unknown> }> = [];
        this.graph.forEachNode((node, attrs) => {
            nodes.push({ key: node, attributes: attrs as Record<string, unknown> });
        });
        return nodes;
    }

    private getSerializedEdges() {
        const edges: Array<{
            source: string;
            target: string;
            attributes: Record<string, unknown>;
        }> = [];
        this.graph.forEachEdge((edge, attrs, source, target) => {
            edges.push({
                source,
                target,
                attributes: attrs as Record<string, unknown>,
            });
        });
        return edges;
    }

    private runCoCitationAnalysisSync(minScore: number, limit: number): Suggestion[] {
        // ... (Existing sync logic, simplified) ...
        const suggestions: Suggestion[] = [];
        const backlinkIndex = new Map<string, Set<string>>();
        this.graph.forEachNode((node) => {
            backlinkIndex.set(node, new Set(this.graph.inNeighbors(node)));
        });

        const allPaths = [...backlinkIndex.keys()];
        const results: Array<{ a: string; b: string; score: number }> = [];

        for (let i = 0; i < allPaths.length; i++) {
            const pathA = allPaths[i];
            const backlinksA = backlinkIndex.get(pathA)!;
            for (let j = i + 1; j < allPaths.length; j++) {
                const pathB = allPaths[j];
                const backlinksB = backlinkIndex.get(pathB)!;
                const score = [...backlinksA].filter((x) => backlinksB.has(x)).length;
                if (score >= minScore) results.push({ a: pathA, b: pathB, score });
            }
        }

        results
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .forEach(({ a, b, score }) => {
                const fileA = this.app.vault.getAbstractFileByPath(a);
                const fileB = this.app.vault.getAbstractFileByPath(b);
                if (fileA instanceof TFile && fileB instanceof TFile) {
                    suggestions.push({
                        id: `cocitation:${[a, b].sort().join('::')}`,
                        type: 'deterministic',
                        link: `[[${fileB.basename}]]`,
                        source: `Co-Citation (Sync): Shared neighbors detected.`,
                        timestamp: Date.now(),
                        category: 'suggestion',
                        meta: {
                            sourcePath: a,
                            targetPath: b,
                            sourceNote: fileA.basename,
                            targetNote: fileB.basename,
                        },
                    });
                }
            });
        return suggestions;
    }

    /**
     * ✅ NEW: Topological Diagnostics (Worker-Delegate).
     * Offloads Bridge, Cycle, and Black Hole detection to the background worker.
     */
    public async runTopologicalAnalysis(options?: Record<string, unknown>): Promise<{
        bridges: Array<{ source: string; target: string; via: string; type: string }>;
        cycles: Array<{ path: string[]; type: string }>;
        blackHoles: Array<{ path: string; inDegree: number }>;
    }> {
        HealerLogger.info('Running Topological Diagnostics (Worker offloaded)...');
        try {
            const nodes = this.getSerializedNodes();
            const edges = this.getSerializedEdges();
            const worker = this.context.graphWorkerService;

            const results = await worker.runAnalysis<{
                bridges: Array<{ source: string; target: string; via: string; type: string }>;
                cycles: Array<{ path: string[]; type: string }>;
                blackHoles: Array<{ path: string; inDegree: number }>;
            }>('TOPOLOGY_DIAGNOSTICS', nodes, edges, options);

            return results || { bridges: [], cycles: [], blackHoles: [] };
        } catch (e) {
            HealerLogger.error('Topological Diagnostics failed in worker.', e);
            return { bridges: [], cycles: [], blackHoles: [] };
        }
    }

    /**
     * Path-to-link helper using centralized context
     */
    private pathToLink(path: string): string {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            const linktext = this.app.metadataCache.fileToLinktext(file, this.linkContextPath, true);
            return `[[${linktext}]]`;
        }
        return `[[${path}]]`;
    }
}
