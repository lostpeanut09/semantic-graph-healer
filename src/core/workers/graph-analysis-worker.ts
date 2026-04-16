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

        payload.nodes.forEach((node) => {
            if (!graph.hasNode(node.key)) {
                graph.addNode(node.key, node.attributes);
            }
        });

        payload.edges.forEach((edge) => {
            if (!graph.hasEdge(edge.source, edge.target)) {
                graph.addEdge(edge.source, edge.target, edge.attributes);
            }
        });

        type MetricFunction = (g: DirectedGraph, o?: Record<string, unknown>) => unknown;
        let result: unknown;

        switch (type) {
            case 'PAGERANK':
                result = (pagerank as MetricFunction)(graph, options);
                break;

            case 'COMMUNITY':
                result = (louvain as MetricFunction)(graph, options);
                break;

            case 'BETWEENNESS':
                result = (betweennessCentrality as MetricFunction)(graph, options);
                break;

            case 'SIMILARITY':
                result = runSimilarityAnalysis(graph, options);
                break;

            case 'COCITATION':
                result = runCoCitationAnalysis(graph, options);
                break;

            case 'FULL_ANALYSIS':
                result = {
                    pageRank: pagerank(graph),
                    communities: louvain(graph),
                    betweenness: graph.order <= 2500 ? betweennessCentrality(graph) : null,
                    nodeCount: graph.order,
                    edgeCount: graph.size,
                };
                break;
        }

        self.postMessage({
            type: 'RESULT',
            payload: { requestId, data: result },
        } as WorkerResponse);
    } catch (error) {
        self.postMessage({
            type: 'ERROR',
            payload: { requestId, message: (error as Error).message },
        } as WorkerResponse);
    }
};

/**
 * Optimized Similarity Analysis (Jaccard, AA, RA).
 * Uses Inverted Index for Candidate Generation.
 */
function runSimilarityAnalysis(graph: DirectedGraph, options: unknown) {
    const weights = options?.weights || { jaccard: 0.35, adamicAdar: 0.35, resourceAllocation: 0.3 };
    const limit = options?.limit || 5;
    const fileStats = options?.fileStats || {};
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
function runCoCitationAnalysis(graph: DirectedGraph, options: unknown) {
    const minScore = options?.minScore || 2;
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
