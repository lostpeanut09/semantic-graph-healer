import { DirectedGraph } from 'graphology';
import pagerank from 'graphology-metrics/centrality/pagerank';
import louvain from 'graphology-communities-louvain';
import betweennessCentrality from 'graphology-metrics/centrality/betweenness';
import { z } from 'zod';
import type { WorkerResponse, GraphAnalysisResult } from '../../types';
export type { WorkerResponse };

// --- Phase 2: OSS Hardening (Zod Validation) ---

const NodeSchema = z.object({
    key: z.string(),
    attributes: z.record(z.string(), z.unknown()).default({}),
});

const EdgeSchema = z.object({
    source: z.string(),
    target: z.string(),
    attributes: z.record(z.string(), z.unknown()).default({}),
});

const WorkerMessageSchema = z
    .object({
        type: z.enum([
            'PAGERANK',
            'COMMUNITY',
            'BETWEENNESS',
            'FULL_ANALYSIS',
            'SIMILARITY',
            'COCITATION',
            'TOPOLOGY_DIAGNOSTICS',
        ]),
        payload: z.object({
            nodes: z.array(NodeSchema),
            edges: z.array(EdgeSchema),
            requestId: z.string(),
        }),
        options: z
            .object({
                limit: z.number().optional(),
                minScore: z.number().optional(),
                weights: z
                    .object({
                        jaccard: z.number(),
                        adamicAdar: z.number(),
                        resourceAllocation: z.number(),
                    })
                    .optional(),
                fileStats: z.record(z.string(), z.object({ mtime: z.number() })).optional(),
                edgePolicy: z.enum(['strict', 'tolerant']).optional(),
                maxEdges: z.number().optional(),
                maxNodes: z.number().optional(),
                blackHoleThreshold: z.number().optional(),
                htrStructuralWeight: z.number().optional(),
                embeddings: z.record(z.string(), z.array(z.number())).optional(),
            })
            .loose()
            .optional(),
    })
    .loose();

/**
 * WorkerMessage
 *
 * Zod-validated schema for messages sent to the Graph Analysis worker.
 * Defines supported analysis types (PAGERANK, COMMUNITY, etc.) and payload structure.
 */
export type WorkerMessage = z.infer<typeof WorkerMessageSchema>;

/**
 * Calculates cosine similarity between two vectors.
 *
 * @param v1 - The first vector.
 * @param v2 - The second vector.
 * @returns The cosine similarity score (0 to 1).
 */
function cosineSimilarity(v1: number[], v2: number[]): number {
    if (!v1 || !v2 || v1.length === 0 || v1.length !== v2.length) return 0;
    let dot = 0;
    let norm1 = 0;
    let norm2 = 0;
    for (let i = 0; i < v1.length; i++) {
        dot += v1[i] * v2[i];
        norm1 += v1[i] * v1[i];
        norm2 += v2[i] * v2[i];
    }
    const mag = Math.sqrt(norm1) * Math.sqrt(norm2);
    return mag === 0 ? 0 : dot / mag;
}

/**
 * ProgressReporter
 *
 * Interface for reporting progress from long-running worker tasks back
 * to the main thread.
 */
export interface ProgressReporter {
    postProgress: (requestId: string, pct: number, message: string) => void;
}

/**
 * Creates a ProgressReporter that sends messages to the postMessage function.
 *
 * @param postMessageFn - The function to call for posting worker responses.
 * @returns A ProgressReporter instance.
 */
export const createProgressReporter = (postMessageFn: (msg: WorkerResponse) => void): ProgressReporter => ({
    postProgress: (requestId: string, pct: number, message: string) => {
        postMessageFn({
            type: 'PROGRESS',
            payload: { requestId, data: { pct, message } },
        });
    },
});

const DEFAULT_LIMITS = {
    BETWEENNESS: 2500,
    SIMILARITY: 5000,
    FULL_ANALYSIS: 8000,
    COCITATION: 8000,
    TOPOLOGY_DIAGNOSTICS: 10000,
    MAX_EDGES: 100_000,
} as const;

/**
 * Helper for safe numeric options parsing with fallback and clamp.
 */
const numOpt = (opts: unknown, key: string, fallback: number): number => {
    const v = (opts as Record<string, unknown>)?.[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
    return Math.max(1, Math.floor(v));
};

/**
 * handleGraphWorkerMessage
 *
 * The main entry point for processing messages in the graph analysis worker.
 * Orchestrates various graph algorithms (Pagerank, Louvain, Betweenness, etc.)
 * with structural validation and size limit enforcement.
 *
 * @param message - The raw WorkerMessage from the main thread.
 * @param reporter - Optional ProgressReporter for updates.
 * @returns A WorkerResponse containing the analysis result or an error message.
 */
export function handleGraphWorkerMessage(message: WorkerMessage, reporter?: ProgressReporter): WorkerResponse {
    let requestId = 'unknown';

    try {
        // --- Phase 2 Hardening: Structural Validation ---
        const validated = WorkerMessageSchema.parse(message);
        const { type, payload, options } = validated;
        requestId = payload.requestId;

        const graph = new DirectedGraph();

        const validateGraphSize = (type: string, opts: unknown, nodeLimitDefault: number) => {
            const maxEdges = numOpt(opts, 'maxEdges', DEFAULT_LIMITS.MAX_EDGES);
            if (graph.size > maxEdges) {
                throw new Error(`Graph too dense (edges=${graph.size}, limit=${maxEdges})`);
            }
            const maxNodes = numOpt(opts, 'maxNodes', nodeLimitDefault);
            if (graph.order > maxNodes) {
                throw new Error(`Graph too large for ${type} (nodes=${graph.order}, limit=${maxNodes})`);
            }
        };

        const policy = options?.edgePolicy === 'tolerant' ? 'tolerant' : 'strict';

        payload.nodes.forEach((node) => {
            if (!graph.hasNode(node.key)) {
                graph.addNode(node.key, node.attributes);
            }
        });

        payload.edges.forEach((edge) => {
            if (!graph.hasNode(edge.source)) {
                if (policy === 'strict') throw new Error(`Missing source node: ${edge.source}`);
                graph.addNode(edge.source, {});
            }
            if (!graph.hasNode(edge.target)) {
                if (policy === 'strict') throw new Error(`Missing target node: ${edge.target}`);
                graph.addNode(edge.target, {});
            }
            if (!graph.hasEdge(edge.source, edge.target)) {
                graph.addEdge(edge.source, edge.target, edge.attributes);
            }
        });

        // --- HTR v2: Vector-Weighted Centrality (HARDEN-09) ---
        const htrWeight = options?.htrStructuralWeight ?? 1.0;
        const embeddings = options?.embeddings;

        if (embeddings && htrWeight < 1.0) {
            graph.updateEachEdgeAttributes((edge, attrs, source, target) => {
                const v1 = embeddings[source];
                const v2 = embeddings[target];
                const similarity = v1 && v2 ? cosineSimilarity(v1, v2) : 0;
                const structural = (attrs.weight as number) || 1.0;
                const newWeight = structural * htrWeight + similarity * (1 - htrWeight);
                return {
                    ...attrs,
                    weight: newWeight,
                };
            });
        }

        let result: unknown;

        switch (type) {
            case 'PAGERANK':
                result = pagerank(graph, options as Parameters<typeof pagerank>[1]);
                break;

            case 'COMMUNITY':
                result = louvain(graph, options as Parameters<typeof louvain>[1]);
                break;

            case 'BETWEENNESS':
                validateGraphSize('BETWEENNESS', options, DEFAULT_LIMITS.BETWEENNESS);
                result = betweennessCentrality(graph, options as Parameters<typeof betweennessCentrality>[1]);
                break;

            case 'SIMILARITY':
                validateGraphSize('SIMILARITY', options, DEFAULT_LIMITS.SIMILARITY);
                result = runSimilarityAnalysis(graph, options, requestId, reporter);
                break;

            case 'COCITATION':
                validateGraphSize('COCITATION', options, DEFAULT_LIMITS.COCITATION);
                result = runCoCitationAnalysis(graph, options, requestId, reporter);
                break;

            case 'FULL_ANALYSIS':
                validateGraphSize('FULL_ANALYSIS', options, DEFAULT_LIMITS.FULL_ANALYSIS);
                result = {
                    pageRank: pagerank(graph, options as Parameters<typeof pagerank>[1]),
                    communities: louvain(graph, options as Parameters<typeof louvain>[1]),
                    betweenness:
                        graph.order <= DEFAULT_LIMITS.BETWEENNESS
                            ? (betweennessCentrality(
                                  graph,
                                  options as Parameters<typeof betweennessCentrality>[1],
                              ) as Record<string, number>)
                            : null,
                    nodeCount: graph.order,
                    edgeCount: graph.size,
                };
                break;

            case 'TOPOLOGY_DIAGNOSTICS':
                validateGraphSize('TOPOLOGY_DIAGNOSTICS', options, DEFAULT_LIMITS.TOPOLOGY_DIAGNOSTICS);
                result = runTopologicalDiagnostics(graph, options, requestId, reporter);
                break;

            default:
                throw new Error(`Unsupported graph worker message type: ${String(type)}`);
        }

        return {
            type: 'RESULT',
            payload: { requestId, data: result as GraphAnalysisResult },
        };
    } catch (error: unknown) {
        let message = (error as Error).message || 'Unknown analysis error';

        // --- Phase 2 Hardening: Structural Error Formatting ---
        if (error instanceof z.ZodError) {
            const issues = error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
            message = `Validation Error: ${issues}`;

            // Compatibility check: if 'type' is the issue, include the expected error substring for tests
            if (error.issues.some((i) => i.path.includes('type'))) {
                message = `Unsupported graph worker message type. Details: ${issues}`;
            }
        }

        return {
            type: 'ERROR',
            payload: { requestId, message },
        };
    }
}

interface SimilarityOptions {
    weights?: { jaccard: number; adamicAdar: number; resourceAllocation: number };
    limit?: number;
    fileStats?: Record<string, { mtime: number }>;
}

/**
 * runSimilarityAnalysis
 *
 * Performs semantic similarity analysis between nodes in the graph using
 * Jaccard, Adamic-Adar, Resource Allocation, and temporal heuristics.
 *
 * @param graph - The DirectedGraph instance.
 * @param options - Similarity options (weights, limits, file stats).
 * @param requestId - Unique ID for the request.
 * @param reporter - Optional reporter for progress updates.
 * @returns Array of node pairs with their similarity scores.
 */
function runSimilarityAnalysis(graph: DirectedGraph, options: unknown, requestId: string, reporter?: ProgressReporter) {
    const opts = options as SimilarityOptions | undefined;
    const weights = opts?.weights || {
        jaccard: 0.35,
        adamicAdar: 0.35,
        resourceAllocation: 0.3,
    };
    const limit = opts?.limit || 5;
    const fileStats = opts?.fileStats || {};
    const predictions: Array<{ source: string; target: string; score: number }> = [];

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

    const nodeCount = graph.order;
    let processedNodes = 0;

    graph.forEachNode((source) => {
        processedNodes++;
        if (processedNodes % 50 === 0 && reporter) {
            reporter.postProgress(requestId, processedNodes / nodeCount, `Analyzing similarity for ${source}...`);
        }

        const sourceNeighbors = neighborsMap.get(source)!;
        if (sourceNeighbors.size === 0) return;

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
            const shared = new Set<string>();
            const [smaller, larger] =
                sourceNeighbors.size < targetNeighbors.size
                    ? [sourceNeighbors, targetNeighbors]
                    : [targetNeighbors, sourceNeighbors];
            smaller.forEach((x) => {
                if (larger.has(x)) shared.add(x);
            });
            if (shared.size < 2) return;

            const unionSize = sourceNeighbors.size + targetNeighbors.size - shared.size;
            const jaccard = shared.size / unionSize;

            let adamicAdar = 0;
            shared.forEach((z) => {
                const deg = neighborsMap.get(z)?.size || 0;
                if (deg > 1) adamicAdar += 1 / Math.log(deg);
            });
            const maxAA = shared.size * (1 / Math.log(2));
            const normalizedAA = maxAA > 0 ? Math.min(adamicAdar / maxAA, 1) : 0;

            let ra = 0;
            shared.forEach((z) => {
                const deg = neighborsMap.get(z)?.size || 0;
                if (deg > 0) ra += 1 / deg;
            });
            const normalizedRA = Math.min(ra, 1);

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

interface CoCitationOptions {
    minScore?: number;
}

/**
 * runCoCitationAnalysis
 *
 * Identifies nodes that are frequently cited together by other nodes.
 *
 * @param graph - The DirectedGraph instance.
 * @param options - Co-citation options (minScore).
 * @param requestId - Unique ID for the request.
 * @param reporter - Optional reporter for progress updates.
 * @returns Array of node pairs with their co-citation count.
 */
function runCoCitationAnalysis(graph: DirectedGraph, options: unknown, requestId: string, reporter?: ProgressReporter) {
    const opts = options as CoCitationOptions | undefined;
    const minScore = opts?.minScore || 2;
    const results: Array<{ a: string; b: string; score: number }> = [];

    const inNeighbors = new Map<string, Set<string>>();
    graph.forEachNode((node) => {
        inNeighbors.set(node, new Set(graph.inNeighbors(node)));
    });

    const processedPairs = new Set<string>();
    const nodeCount = graph.order;
    let processedNodes = 0;

    graph.forEachNode((source) => {
        processedNodes++;
        if (processedNodes % 50 === 0 && reporter) {
            reporter.postProgress(requestId, processedNodes / nodeCount, `Analyzing co-citation for ${source}...`);
        }

        const parents = inNeighbors.get(source)!;
        if (parents.size === 0) return;

        const candidates = new Set<string>();
        parents.forEach((parent) => {
            graph.outNeighbors(parent).forEach((sibling) => {
                if (sibling !== source) candidates.add(sibling);
            });
        });

        candidates.forEach((target) => {
            const pairId = source < target ? `${source}|||${target}` : `${target}|||${source}`;
            if (processedPairs.has(pairId)) return;
            processedPairs.add(pairId);

            const targetParents = inNeighbors.get(target)!;
            let sharedCount = 0;
            const [smaller, larger] =
                parents.size < targetParents.size ? [parents, targetParents] : [targetParents, parents];
            smaller.forEach((p) => {
                if (larger.has(p)) sharedCount++;
            });

            if (sharedCount >= minScore) {
                results.push({ a: source, b: target, score: sharedCount });
            }
        });
    });

    return results;
}

interface TopologyDiagnosticsOptions {
    blackHoleThreshold?: number;
}

/**
 * runTopologicalDiagnostics
 *
 * Analyzes the graph structure to identify bridges, black holes, and cycles.
 *
 * @param graph - The DirectedGraph instance.
 * @param options - Diagnostic options (blackHoleThreshold).
 * @param requestId - Unique ID for the request.
 * @param reporter - Optional reporter for progress updates.
 * @returns Object containing detected bridges, black holes, and cycles.
 */
function runTopologicalDiagnostics(
    graph: DirectedGraph,
    options: unknown,
    requestId: string,
    reporter?: ProgressReporter,
) {
    const opts = options as TopologyDiagnosticsOptions | undefined;
    const blackHoleThreshold = opts?.blackHoleThreshold || 7;

    const bridges: Array<{ source: string; target: string; via: string; type: string }> = [];
    const blackHoles: Array<{ path: string; inDegree: number }> = [];
    const cycles: Array<{ path: string[]; type: string }> = [];

    const nodeCount = graph.order;
    let processedNodes = 0;

    // 1. Black Holes & Bridges
    graph.forEachNode((a) => {
        processedNodes++;
        if (processedNodes % 50 === 0 && reporter) {
            reporter.postProgress(requestId, processedNodes / nodeCount, `Diagnosing topology for ${a}...`);
        }

        // Black Hole detection
        const inDeg = graph.inDegree(a);
        if (inDeg >= blackHoleThreshold && graph.outDegree(a) === 0) {
            blackHoles.push({ path: a, inDegree: inDeg });
        }

        // Bridge Scrutiny (Depth 2)
        graph.outEdges(a).forEach((edgeAB) => {
            const b = graph.target(edgeAB);
            const typeAB = graph.getEdgeAttribute(edgeAB, 'type') as string | undefined;

            if (typeAB) {
                graph.outEdges(b).forEach((edgeBC) => {
                    const c = graph.target(edgeBC);
                    const typeBC = graph.getEdgeAttribute(edgeBC, 'type') as string | undefined;

                    if (typeAB === typeBC && a !== c && !graph.hasEdge(a, c)) {
                        bridges.push({
                            source: a,
                            target: c,
                            via: b,
                            type: typeAB,
                        });
                    }
                });
            }
        });
    });

    // 2. Cycle Detection (DFS)
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string) => {
        visited.add(node);
        recursionStack.add(node);
        path.push(node);

        graph.outNeighbors(node).forEach((neighbor) => {
            if (!visited.has(neighbor)) {
                dfs(neighbor);
            } else if (recursionStack.has(neighbor)) {
                const cycleStartIndex = path.indexOf(neighbor);
                const cyclePath = path.slice(cycleStartIndex);

                // Identify cycle type (if all edges in cycle share a type)
                let cycleType = 'universal';
                const edgeTypes = new Set<string>();
                for (let i = 0; i < cyclePath.length; i++) {
                    const src = cyclePath[i];
                    const tgt = i === cyclePath.length - 1 ? cyclePath[0] : cyclePath[i + 1];
                    const edgeType = graph.getEdgeAttribute(src, tgt, 'type') as string | undefined;
                    if (edgeType) edgeTypes.add(edgeType);
                }
                if (edgeTypes.size === 1) {
                    cycleType = Array.from(edgeTypes)[0];
                }

                cycles.push({ path: cyclePath, type: cycleType });
            }
        });

        recursionStack.delete(node);
        path.pop();
    };

    graph.forEachNode((node) => {
        if (!visited.has(node)) {
            dfs(node);
        }
    });

    return {
        bridges,
        blackHoles,
        cycles,
    };
}
