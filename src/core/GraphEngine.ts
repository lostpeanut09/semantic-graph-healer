import { App, TFile } from 'obsidian';
import { DirectedGraph } from 'graphology';
import pagerank from 'graphology-metrics/centrality/pagerank';
// louvain: Refactored to Web Worker
// betweennessCentrality: Refactored to Web Worker
import { Suggestion, SemanticGraphHealerSettings } from '../types';
import { HealerLogger } from './HealerUtils';

import SemanticGraphHealer from '../main';

interface GraphNodeAttributes {
    label: string;
    size: number;
}

export class GraphEngine {
    private graph: DirectedGraph;
    private graphVersion = 0;
    private lastPagerankResult: Record<string, number> | null = null;
    private lastPagerankVersion = -1;
    private readonly linkContextPath = '';

    constructor(private plugin: SemanticGraphHealer) {
        this.graph = new DirectedGraph();
    }

    private get app(): App {
        return this.plugin.app;
    }

    private get settings(): SemanticGraphHealerSettings {
        return this.plugin.settings;
    }

    /**
     * ✅ NEW: Explicit memory management for large graphs.
     */
    public dispose() {
        this.graph.clear();
        this.lastPagerankResult = null;
        this.lastPagerankVersion = -1;
        HealerLogger.info('GraphEngine disposed, memory released.');
    }

    /**
     * ✅ NEW: Cache status reporting for UI synchronization.
     */
    public getCacheStatus() {
        return {
            valid: this.lastPagerankResult !== null && this.lastPagerankVersion === this.graphVersion,
            version: this.graphVersion,
            nodes: this.graph.order,
            edges: this.graph.size,
        };
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

        // 2. Add Weighted Edges (with guardrails)
        let edgeCount = 0;
        for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
            if (!this.graph.hasNode(sourcePath)) continue;
            if (useGuardrails && edgeCount >= maxEdges) break;

            for (const [targetPath, rawCount] of Object.entries(targets)) {
                if (useGuardrails && edgeCount >= maxEdges) break;
                if (!this.graph.hasNode(targetPath)) continue;
                if (sourcePath === targetPath) continue;

                const count = Number(rawCount ?? 1);
                const weight = Math.log1p(count);

                if (this.graph.hasEdge(sourcePath, targetPath)) {
                    const prev = this.graph.getEdgeAttribute(sourcePath, targetPath, 'weight') as number;
                    this.graph.setEdgeAttribute(sourcePath, targetPath, 'weight', prev + weight);
                } else {
                    this.graph.addEdge(sourcePath, targetPath, { weight });
                    edgeCount++;
                }
            }
        }

        this.graphVersion++;
        this.lastPagerankResult = null;
        this.lastPagerankVersion = -1;

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
            // Serialize graph for the worker
            const nodes: Array<{ key: string; attributes: Record<string, unknown> }> = [];
            this.graph.forEachNode((node, attrs) => {
                nodes.push({ key: node, attributes: attrs as Record<string, unknown> });
            });

            const edges: Array<{ source: string; target: string; attributes: Record<string, unknown> }> = [];
            this.graph.forEachEdge((edge, attrs, source, target) => {
                edges.push({ source, target, attributes: attrs as Record<string, unknown> });
            });

            const worker = this.plugin.graphWorkerService;
            const scores = await worker.runAnalysis<Record<string, number>>('PAGERANK', nodes, edges, {
                getEdgeWeight: 'weight',
                alpha: 0.85,
                maxIterations: 200,
                tolerance: 1e-6,
            });

            this.lastPagerankResult = scores;
            this.lastPagerankVersion = this.graphVersion;
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
        try {
            const nodes: Array<{ key: string; attributes: Record<string, unknown> }> = [];
            this.graph.forEachNode((node, attrs) => {
                nodes.push({ key: node, attributes: attrs });
            });

            const edges: Array<{ source: string; target: string; attributes: Record<string, unknown> }> = [];
            this.graph.forEachEdge((edge, attrs, source, target) => {
                edges.push({ source, target, attributes: attrs });
            });

            const worker = this.plugin.graphWorkerService;
            const communities = await worker.runAnalysis<Record<string, number>>('COMMUNITY', nodes, edges, {
                getEdgeWeight: 'weight',
            });

            if (!communities) return [];

            const suggestions: Suggestion[] = [];
            const isCacheValid = this.lastPagerankResult && this.lastPagerankVersion === this.graphVersion;

            // Still uses sync pagerank for small clusters if cache is missing, but pagerank is fast.
            // Full PageRank is offloaded separately.
            const prScores = isCacheValid
                ? (this.lastPagerankResult as Record<string, number>)
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

            Object.entries(clusters).forEach(([commId, paths]) => {
                if (paths.length < 5) return;

                const sortedPaths = paths.sort((a, b) => (prScores[b] || 0) - (prScores[a] || 0));
                const representativePath = sortedPaths[0];
                const file = this.app.vault.getAbstractFileByPath(representativePath);
                const link = this.pathToLink(representativePath);

                suggestions.push({
                    id: `cluster:${commId}:${representativePath}`,
                    type: 'quality',
                    link: link,
                    source: `Thematic Cluster #${commId} detected (${paths.length} notes).`,
                    timestamp: Date.now(),
                    category: 'info',
                    meta: {
                        confidence: 70,
                        sourceNote: file instanceof TFile ? file.basename : representativePath,
                        description: `Conceptual group centered around ${file instanceof TFile ? file.basename : representativePath}.`,
                    },
                });
            });

            return suggestions;
        } catch (e) {
            HealerLogger.error('Community detection failed in worker', e);
            return [];
        }
    }

    /**
     * Weighted Betweenness Centrality (Bridges) - Worker-Delegate.
     * SOTA 2026: No longer requires sync guardrails as it runs in background.
     */
    public async runBetweennessAnalysis(): Promise<Suggestion[]> {
        HealerLogger.info('Running Weighted Betweenness Centrality (Worker Bridges)...');
        try {
            const nodes: Array<{ key: string; attributes: Record<string, unknown> }> = [];
            this.graph.forEachNode((node, attrs) => {
                nodes.push({ key: node, attributes: attrs as Record<string, unknown> });
            });

            const edges: Array<{ source: string; target: string; attributes: Record<string, unknown> }> = [];
            this.graph.forEachEdge((edge, attrs, source, target) => {
                edges.push({ source, target, attributes: attrs as Record<string, unknown> });
            });

            const worker = this.plugin.graphWorkerService;
            const scores = await worker.runAnalysis<Record<string, number>>('BETWEENNESS', nodes, edges, {
                getEdgeWeight: 'weight',
            });

            if (!scores) return [];

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
        } catch (e) {
            HealerLogger.error('Betweenness Centrality failed in worker', e);
            return [];
        }
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
            const worker = this.plugin.graphWorkerService;

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
        HealerLogger.info('Running Deep Topology Similarity Analysis (Worker offloaded)...');

        try {
            const nodes = this.getSerializedNodes();
            const edges = this.getSerializedEdges();
            const worker = this.plugin.graphWorkerService;

            const results = await worker.runAnalysis<Array<{ source: string; target: string; score: number }>>(
                'SIMILARITY',
                nodes,
                edges,
                {
                    weights: this.settings.linkPredictionWeights,
                    limit: options?.limit || 5,
                    fileStats: this.getFileStats(),
                },
            );

            if (!results) return [];

            const suggestions: Suggestion[] = [];
            for (const res of results) {
                const fileS = this.app.vault.getAbstractFileByPath(res.source);
                const fileT = this.app.vault.getAbstractFileByPath(res.target);
                if (!(fileS instanceof TFile) || !(fileT instanceof TFile)) continue;

                suggestions.push({
                    id: `predicted_link:${res.source}:${res.target}`,
                    type: 'semantic_inference',
                    link: this.pathToLink(res.target),
                    source: `Predicted Semantic Connection: [[${fileS.basename}]] and [[${fileT.basename}]] share high topological similarity (Score: ${res.score.toFixed(2)}).`,
                    timestamp: Date.now(),
                    category: 'suggestion',
                    meta: {
                        confidence: Math.round(res.score * 100),
                        sourcePath: res.source,
                        targetPath: res.target,
                        sourceNote: fileS.basename,
                        targetNote: fileT.basename,
                        description: `Topological similarity predicted via Jaccard/AA/RA hybrid.`,
                    },
                });
            }

            return suggestions;
        } catch (e) {
            HealerLogger.error('Similarity analysis failed in worker.', e);
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
        const edges: Array<{ source: string; target: string; attributes: Record<string, unknown> }> = [];
        this.graph.forEachEdge((edge, attrs, source, target) => {
            edges.push({ source, target, attributes: attrs as Record<string, unknown> });
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
                        meta: { sourcePath: a, targetPath: b, sourceNote: fileA.basename, targetNote: fileB.basename },
                    });
                }
            });
        return suggestions;
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
