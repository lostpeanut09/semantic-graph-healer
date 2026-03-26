import { App, TFile } from 'obsidian';
import { MultiDirectedGraph } from 'graphology';
import pagerank from 'graphology-metrics/centrality/pagerank';
import louvain from 'graphology-communities-louvain';
import betweennessCentrality from 'graphology-metrics/centrality/betweenness';
import { Suggestion } from '../types';
import { HealerLogger, generateId } from './HealerUtils';

interface GraphNodeAttributes {
    label: string;
    size: number;
}

export class GraphEngine {
    private graph: MultiDirectedGraph;

    constructor(private app: App) {
        this.graph = new MultiDirectedGraph();
    }

    /**
     * Builds the graph in memory using Obsidian's cache.
     * O(N+M) complexity.
     */
    public buildGraph() {
        this.graph.clear();
        const resolvedLinks = this.app.metadataCache.resolvedLinks;

        // 1. Add Nodes
        const files = this.app.vault.getMarkdownFiles();
        files.forEach((f: TFile) => {
            this.graph.addNode(f.path, {
                label: f.basename,
                size: f.stat.size,
            } as GraphNodeAttributes);
        });

        // 2. Add Edges
        for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
            if (!this.graph.hasNode(sourcePath)) continue;

            for (const targetPath of Object.keys(targets)) {
                if (this.graph.hasNode(targetPath)) {
                    if (sourcePath !== targetPath) {
                        try {
                            this.graph.addEdge(sourcePath, targetPath);
                        } catch {
                            // Edge might already exist or other graphology constraint
                        }
                    }
                }
            }
        }

        HealerLogger.info(`Graph built: ${this.graph.order} nodes, ${this.graph.size} edges.`);
    }

    /**
     * PageRank analysis for node authority.
     */
    public runPageRankAnalysis(): Suggestion[] {
        HealerLogger.info('Running PageRank...');
        try {
            const scores = pagerank(this.graph);
            return this.processScores(scores, 'pagerank_auth', 'PageRank authority mapping');
        } catch (e) {
            HealerLogger.warn('PageRank failed to converge. Falling back to degree centrality.', e);
            return this.runDegreeCentralityFallback();
        }
    }

    private runDegreeCentralityFallback(): Suggestion[] {
        const scores: Record<string, number> = {};
        this.graph.forEachNode((node: string) => {
            const g = this.graph as unknown as { neighbors: (id: string) => string[] };
            const neighbors = g.neighbors(node);
            scores[node] = neighbors.length; // Assuming degree is number of neighbors
        });
        return this.processScores(scores, 'degree_fallback', 'Degree centrality fallback');
    }

    private processScores(scores: Record<string, number>, idPrefix: string, method: string): Suggestion[] {
        const suggestions: Suggestion[] = [];
        const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);

        // Top 5% as key concepts
        const topCount = Math.ceil(sorted.length * 0.05);
        const topNodes = sorted.slice(0, topCount);

        topNodes.forEach(([path, score]) => {
            const node = this.graph.getNodeAttributes(path) as GraphNodeAttributes;
            suggestions.push({
                id: generateId(`${idPrefix}:${path}`),
                type: 'quality',
                link: `[[${node.label}]]`,
                source: `High Authority Note (${method}: ${score.toFixed(4)}). Central pillar of the vault.`,
                timestamp: Date.now(),
                category: 'info',
                meta: {
                    description: `Identified as a Key Concept by ${method}.`,
                    confidence: 100,
                    sourceNote: node.label,
                },
            });
        });

        return suggestions;
    }

    /**
     * Louvain Community Detection for thematic clustering.
     */
    public runCommunityDetection(): Suggestion[] {
        HealerLogger.info('Running Louvain Community Detection...');
        const communities = (louvain as (g: unknown) => Record<string, number>)(this.graph);
        const suggestions: Suggestion[] = [];

        const clusters: Record<string, string[]> = {};
        Object.entries(communities).forEach(([path, commId]) => {
            const id = String(commId);
            if (!clusters[id]) clusters[id] = [];
            clusters[id].push(path);
        });

        Object.entries(clusters).forEach(([commId, paths]) => {
            if (paths.length < 5) return;

            const nodeAttr = this.graph.getNodeAttributes(paths[0]) as GraphNodeAttributes;
            const representative = nodeAttr.label;

            suggestions.push({
                id: generateId(`community_louvain:${commId}`),
                type: 'quality',
                link: `[[${representative}]] (and ${paths.length - 1} others)`,
                source: `Thematic Cluster #${commId} detected with ${paths.length} tightly connected notes.`,
                timestamp: Date.now(),
                category: 'info',
                meta: {
                    description: `Automated topic cluster identified via Louvain modularity algorithm.`,
                    confidence: 90,
                    winner: `Consider creating a MOC for this cluster.`,
                },
            });
        });

        return suggestions;
    }

    /**
     * Betweenness Centrality for bridge identification.
     * O(NM) complexity. Safety guard for large vaults.
     */
    public runBetweennessAnalysis(): Suggestion[] {
        HealerLogger.info('Running Betweenness Centrality...');

        if (this.graph.order > 2500) {
            HealerLogger.warn('Graph too large for synchronous Betweenness Centrality. Skipping to prevent freeze.');
            return [];
        }

        const scores = betweennessCentrality(this.graph);
        const suggestions: Suggestion[] = [];

        const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
        const topBrokers = sorted.slice(0, 10);

        topBrokers.forEach(([path, score]) => {
            const node = this.graph.getNodeAttributes(path) as GraphNodeAttributes;
            if (score > 0) {
                suggestions.push({
                    id: generateId(`betweenness_bridge:${path}`),
                    type: 'quality',
                    link: `[[${node.label}]]`,
                    source: `Critical Bridge Detected (Betweenness: ${score.toFixed(2)}). Connects disparate topics.`,
                    timestamp: Date.now(),
                    category: 'info',
                    meta: {
                        description: 'Key connectivity node bridging different clusters.',
                        confidence: 85,
                        sourceNote: node.label,
                    },
                });
            }
        });

        return suggestions;
    }
}
