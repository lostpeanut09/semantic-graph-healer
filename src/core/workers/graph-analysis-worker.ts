// Dedicated worker for heavy graph analysis
import { DirectedGraph } from 'graphology';
import pagerank from 'graphology-metrics/centrality/pagerank';
import louvain from 'graphology-communities-louvain';
import betweennessCentrality from 'graphology-metrics/centrality/betweenness';

type WorkerMessage = {
    type: 'PAGERANK' | 'COMMUNITY' | 'BETWEENNESS' | 'FULL_ANALYSIS' | 'SIMILARITY' | 'COCITATION';
    payload: {
        nodes: Array<{ key: string; attributes: Record<string, unknown> }>;
        edges: Array<{ source: string; target: string; attributes: Record<string, unknown> }>;
        requestId: string;
    };
    options?: {
        limit?: number;
        minScore?: number;
        weights?: {
            jaccard: number;
            adamicAdar: number;
            resourceAllocation: number;
        };
        fileStats?: Record<string, { mtime: number }>;
        [key: string]: unknown; // Allow additional per-algorithm options
    };
};

type WorkerResponse = {
    type: 'RESULT' | 'ERROR' | 'PROGRESS';
    payload: {
        requestId: string;
        data?: unknown;
        message?: string;
    };
};

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const { type, payload, options } = e.data;
    const requestId = payload.requestId;

    try {
        const graph = new DirectedGraph();
        const DEFAULT_LIMITS = {
            BETWEENNESS: 2500,
            SIMILARITY: 5000,
            FULL_ANALYSIS: 8000,
            COCITATION: 8000,
            MAX_EDGES: 100000,
        };

        const validateGraphSize = (type: string, limit: number) => {
            if (graph.order > limit) {
                throw new Error(`Graph too large for ${type} (nodes=${graph.order}, limit=${limit})`);
            }
            if (graph.size > DEFAULT_LIMITS.MAX_EDGES) {
                throw new Error(
                    `Graph too dense for analysis (edges=${graph.size}, limit=${DEFAULT_LIMITS.MAX_EDGES})`,
                );
            }
        };

        const addEdgeStrict = (e: { source: string; target: string; attributes: Record<string, unknown> }) => {
            if (!graph.hasNode(e.source) || !graph.hasNode(e.target)) {
                throw new Error(`Invalid edge: missing node(s) for ${e.source} -> ${e.target}`);
            }
            if (!graph.hasEdge(e.source, e.target)) {
                graph.addEdge(e.source, e.target, e.attributes);
            }
        };

        payload.nodes.forEach((node) => {
            if (!graph.hasNode(node.key)) {
                graph.addNode(node.key, node.attributes);
            }
        });

        payload.edges.forEach((edge) => addEdgeStrict(edge));

        let result: unknown;

        switch (type) {
            case 'PAGERANK':
                result = pagerank(graph, options as Parameters<typeof pagerank>[1]);
                break;

            case 'COMMUNITY':
                result = louvain(graph, options as Parameters<typeof louvain>[1]);
                break;

            case 'BETWEENNESS':
                validateGraphSize('BETWEENNESS', DEFAULT_LIMITS.BETWEENNESS);
                result = betweennessCentrality(graph, options as Parameters<typeof betweennessCentrality>[1]);
                break;

            case 'SIMILARITY':
                validateGraphSize('SIMILARITY', DEFAULT_LIMITS.SIMILARITY);
                result = runSimilarityAnalysis(graph, options);
                break;

            case 'COCITATION':
                validateGraphSize('COCITATION', DEFAULT_LIMITS.COCITATION);
                result = runCoCitationAnalysis(graph, options);
                break;

            case 'FULL_ANALYSIS':
                validateGraphSize('FULL_ANALYSIS', DEFAULT_LIMITS.FULL_ANALYSIS);
                result = {
                    pageRank: pagerank(graph, options as Parameters<typeof pagerank>[1]),
                    communities: louvain(graph, options as Parameters<typeof louvain>[1]),
                    betweenness:
                        graph.order <= DEFAULT_LIMITS.BETWEENNESS
                            ? betweennessCentrality(graph, options as Parameters<typeof betweennessCentrality>[1])
                            : null,
                    nodeCount: graph.order,
                    edgeCount: graph.size,
                };
                break;

            default:
                throw new Error(`Unsupported graph worker message type: ${String(type)}`);
        }

        self.postMessage({
            type: 'RESULT',
            payload: { requestId, data: result },
        } as WorkerResponse);
    } catch (error) {
        self.postMessage({
            type: 'ERROR',
            payload: { requestId, message: (error as Error).message || 'Unknown analysis error' },
        } as WorkerResponse);
    }
};

/**
 * Optimized Similarity Analysis (Jaccard, AA, RA).
 * Uses Inverted Index for Candidate Generation.
 */
interface SimilarityOptions {
    weights?: { jaccard: number; adamicAdar: number; resourceAllocation: number };
    limit?: number;
    fileStats?: Record<string, { mtime: number }>;
}

function runSimilarityAnalysis(graph: DirectedGraph, options: unknown) {
    const opts = options as SimilarityOptions | undefined;
    const weights = opts?.weights || { jaccard: 0.35, adamicAdar: 0.35, resourceAllocation: 0.3 };
    const limit = opts?.limit || 5;
    const fileStats = opts?.fileStats || {};
    const predictions: Array<{ source: string; target: string; score: number }> = [];

    // 1. Build Neighbor Map and Inverted Index (Neighbor -> Nodes)
    const neighborsMap = new Map<string, Set<string>>();
    const invertedIndex = new Map<string, Set<string>>();

    graph.forEachNode((node) => {
        const neighbors = new Set(graph.neighbors(node));
        neighborsMap.set(node, neighbors);

        neighbors.forEach((neighbor) => {
            if (!invertedIndex.has(neighbor)) invertedIndex.set(neighbor, new Set());
            invertedIndex.get(neighbor)!.add(node);
        });
    });

    // 2. Candidate Generation & Scoring
    graph.forEachNode((source) => {
        const sourceNeighbors = neighborsMap.get(source)!;
        if (sourceNeighbors.size === 0) return;

        // Find candidates who share at least one neighbor
        const candidates = new Set<string>();
        sourceNeighbors.forEach((neighbor) => {
            invertedIndex.get(neighbor)?.forEach((node) => {
                if (node !== source && !graph.hasEdge(source, node)) {
                    candidates.add(node);
                }
            });
        });

        const nodePredictions: Array<{ target: string; score: number }> = [];

        candidates.forEach((target) => {
            const targetNeighbors = neighborsMap.get(target)!;
            const shared = new Set([...sourceNeighbors].filter((x) => targetNeighbors.has(x)));
            if (shared.size < 2) return;

            // Score calculation (Simplified port of LinkPredictionEngine logic)
            // Jaccard
            const unionSize = new Set([...sourceNeighbors, ...targetNeighbors]).size;
            const jaccard = shared.size / unionSize;

            // Adamic-Adar
            let adamicAdar = 0;
            shared.forEach((z) => {
                const deg = neighborsMap.get(z)?.size || 0;
                if (deg > 1) adamicAdar += 1 / Math.log(deg);
            });
            const maxAA = shared.size * (1 / Math.log(2));
            const normalizedAA = maxAA > 0 ? Math.min(adamicAdar / maxAA, 1) : 0;

            // Resource Allocation
            let ra = 0;
            shared.forEach((z) => {
                const deg = neighborsMap.get(z)?.size || 0;
                if (deg > 0) ra += 1 / deg;
            });
            const normalizedRA = Math.min(ra, 1);

            // Temporal Decay
            let temporalMultiplier = 1;
            const sTime = fileStats[source]?.mtime;
            const tTime = fileStats[target]?.mtime;
            if (sTime && tTime) {
                const delta = Math.abs(sTime - tTime) / (1000 * 60 * 60 * 24);
                temporalMultiplier = Math.exp(-0.005 * delta);
            }

            const score =
                (jaccard * weights.jaccard +
                    normalizedAA * weights.adamicAdar +
                    normalizedRA * weights.resourceAllocation) *
                temporalMultiplier;
            nodePredictions.push({ target, score });
        });

        nodePredictions
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .forEach((p) => {
                predictions.push({ source, target: p.target, score: p.score });
            });
    });

    return predictions;
}

/**
 * Optimized Co-Citation Analysis.
 */
interface CoCitationOptions {
    minScore?: number;
}

function runCoCitationAnalysis(graph: DirectedGraph, options: unknown) {
    const opts = options as CoCitationOptions | undefined;
    const minScore = opts?.minScore || 2;
    const results: Array<{ a: string; b: string; score: number }> = [];

    // 1. Inverted Index of Backlinkers (Children -> Parents)
    const inNeighbors = new Map<string, Set<string>>();
    graph.forEachNode((node) => {
        inNeighbors.set(node, new Set(graph.inNeighbors(node)));
    });

    const processedPairs = new Set<string>();

    graph.forEachNode((source) => {
        const parents = inNeighbors.get(source)!;
        if (parents.size === 0) return;

        // Find candidates: nodes that share at least one parent
        const candidates = new Set<string>();
        parents.forEach((parent) => {
            graph.outNeighbors(parent).forEach((sibling) => {
                if (sibling !== source) candidates.add(sibling);
            });
        });

        candidates.forEach((target) => {
            const pairId = [source, target].sort().join('|||');
            if (processedPairs.has(pairId)) return;
            processedPairs.add(pairId);

            const targetParents = inNeighbors.get(target)!;
            const sharedCount = [...parents].filter((p) => targetParents.has(p)).length;

            if (sharedCount >= minScore) {
                results.push({ a: source, b: target, score: sharedCount });
            }
        });
    });

    return results;
}

export {};
