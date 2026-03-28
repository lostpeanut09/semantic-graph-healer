import { App, TFile } from 'obsidian';
import { DirectedGraph } from 'graphology';
import pagerank from 'graphology-metrics/centrality/pagerank';
import louvain from 'graphology-communities-louvain';
import betweennessCentrality from 'graphology-metrics/centrality/betweenness';
import { Suggestion } from '../types';
import { HealerLogger } from './HealerUtils';

interface GraphNodeAttributes {
    label: string;
    size: number;
}

export class GraphEngine {
    private graph: DirectedGraph;
    private graphVersion = 0;
    private lastPagerankResult: Record<string, number> | null = null;
    private lastPagerankVersion = -1;
    private readonly linkContextPath = ''; // SOTA 2026: Invariant empty context for dashboard stability

    constructor(private app: App) {
        this.graph = new DirectedGraph();
    }

    /**
     * Builds the graph in memory using Obsidian's cache.
     * Uses Weighted DirectedGraph for SOTA accuracy.
     */
    public buildGraph() {
        this.graph.clear();
        const resolvedLinks = this.app.metadataCache.resolvedLinks;

        // 1. Add Nodes
        const files = this.app.vault.getMarkdownFiles();
        files.forEach((f: TFile) => {
            if (!this.graph.hasNode(f.path)) {
                this.graph.addNode(f.path, {
                    label: f.basename,
                    size: f.stat.size,
                } as GraphNodeAttributes);
            }
        });

        // 2. Add Weighted Edges
        for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
            if (!this.graph.hasNode(sourcePath)) continue;

            for (const [targetPath, rawCount] of Object.entries(targets)) {
                if (!this.graph.hasNode(targetPath)) continue;
                if (sourcePath === targetPath) continue;

                const count = Number(rawCount ?? 1);
                // P1: Logarithmic weight transformation to prevent MOC dominance (SOTA 2026)
                const weight = Math.log1p(count);

                if (this.graph.hasEdge(sourcePath, targetPath)) {
                    const prev = this.graph.getEdgeAttribute(sourcePath, targetPath, 'weight') as number;
                    this.graph.setEdgeAttribute(sourcePath, targetPath, 'weight', prev + weight);
                } else {
                    this.graph.addEdge(sourcePath, targetPath, { weight });
                }
            }
        }
        this.graphVersion++;
        this.lastPagerankResult = null;
        this.lastPagerankVersion = -1;

        HealerLogger.info(`Graph built: ${this.graph.order} nodes, ${this.graph.size} edges.`);
    }

    /**
     * PageRank analysis with weight support.
     */
    public runPageRankAnalysis(): Suggestion[] {
        HealerLogger.info('Running Weighted PageRank (Log-Transformed)...');
        try {
            // Optimization: Cache PageRank per graph version
            const scores = pagerank(this.graph, {
                getEdgeWeight: 'weight',
                alpha: 0.85,
                maxIterations: 200,
                tolerance: 1e-6,
            });
            this.lastPagerankResult = scores;
            this.lastPagerankVersion = this.graphVersion;
            return this.processScores(scores, 'pagerank_auth', 'PageRank authority (log-weighted)');
        } catch (e) {
            HealerLogger.warn('Weighted PageRank failed. Falling back to total degree.', e);
            return this.runDegreeCentralityFallback();
        }
    }

    private runDegreeCentralityFallback(): Suggestion[] {
        const scores: Record<string, number> = {};
        this.graph.forEachNode((node) => {
            let totalWeight = 0;
            // P0: Sum both In and Out edges for true "Centrality"
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
                source: `Graph Analysis (${method}): Recognized as high-influence node (Normalized Score: ${normalized.toFixed(
                    2,
                )}).`,
                timestamp: Date.now(),
                category: 'info',
                meta: {
                    confidence: Math.round(normalized * 100),
                    sourceNote: file instanceof TFile ? file.basename : path,
                    description: `This note is a structural ${
                        idPrefix.includes('pagerank') ? 'authority' : 'hub'
                    } in your graph.`,
                },
            });
        });

        return suggestions;
    }

    /**
     * Louvain Community Detection with weight support.
     */
    public runCommunityDetection(): Suggestion[] {
        HealerLogger.info('Running Weighted Louvain Clustering...');
        const communities = louvain(this.graph, { getEdgeWeight: 'weight' });
        const suggestions: Suggestion[] = [];

        // Pre-calculate PageRank for representative selection (use valid cache if available)
        const isCacheValid = this.lastPagerankResult && this.lastPagerankVersion === this.graphVersion;
        const prScores = isCacheValid
            ? (this.lastPagerankResult as Record<string, number>)
            : pagerank(this.graph, {
                  getEdgeWeight: 'weight',
                  alpha: 0.85,
                  maxIterations: 200,
                  tolerance: 1e-6,
              });

        // P1: Store in cache if newly calculated
        if (!isCacheValid) {
            this.lastPagerankResult = prScores;
            this.lastPagerankVersion = this.graphVersion;
        }

        const clusters: Record<string, string[]> = {};
        Object.entries(communities).forEach(([path, commId]) => {
            const id = String(commId);
            if (!clusters[id]) clusters[id] = [];
            clusters[id].push(path);
        });

        Object.entries(clusters).forEach(([commId, paths]) => {
            if (paths.length < 5) return;

            // Sort paths by PageRank within cluster to find the most "authoritative" note
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
                    confidence: 100,
                    sourceNote: file instanceof TFile ? file.basename : representativePath,
                    description: `Cluster representative: ${
                        file instanceof TFile ? file.basename : representativePath
                    }`,
                },
            });
        });

        return suggestions;
    }

    /**
     * Betweenness Centrality to find structural bridges.
     */
    public runBetweennessAnalysis(): Suggestion[] {
        if (this.graph.order > 2500) {
            HealerLogger.warn(
                `Graph too large for synchronous Betweenness (${this.graph.order} nodes). Guardrail triggered.`,
            );
            return [];
        }
        HealerLogger.info('Running Weighted Betweenness Centrality (Bridges)...');
        const scores = betweennessCentrality(this.graph, {
            getEdgeWeight: 'weight',
        });
        const suggestions: Suggestion[] = [];

        const sorted = Object.entries(scores)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10);

        sorted.forEach(([path, score]) => {
            if (score <= 0) return;

            const file = this.app.vault.getAbstractFileByPath(path);
            const link = this.pathToLink(path);

            suggestions.push({
                // DETERMINISTIC ID
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
