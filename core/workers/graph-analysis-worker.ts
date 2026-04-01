// Dedicated worker for heavy graph analysis
import { DirectedGraph } from 'graphology';
import pagerank from 'graphology-metrics/centrality/pagerank';
import louvain from 'graphology-communities-louvain';
import betweennessCentrality from 'graphology-metrics/centrality/betweenness';

type WorkerMessage = {
    type: 'PAGERANK' | 'COMMUNITY' | 'BETWEENNESS' | 'FULL_ANALYSIS';
    payload: {
        nodes: Array<{ key: string; attributes: Record<string, unknown> }>;
        edges: Array<{ source: string; target: string; attributes: Record<string, unknown> }>;
        requestId: string;
    };
    options?: Record<string, unknown>;
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
        // Reconstruct the graph from serialized data (uses DirectedGraph as in the main GraphEngine)
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

export {};
