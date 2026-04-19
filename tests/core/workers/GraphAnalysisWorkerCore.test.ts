import { describe, it, expect } from 'vitest';
import { handleGraphWorkerMessage, WorkerMessage } from '../../../src/core/workers/graph-analysis-core';

function msg(type: any, nodes: string[], edges: Array<[string, string]>, options?: any): WorkerMessage {
    return {
        type,
        payload: {
            requestId: 'r1',
            nodes: nodes.map((id) => ({ key: id, attributes: {} })),
            edges: edges.map(([source, target]) => ({ source, target, attributes: {} })),
        },
        options: options ?? {},
    };
}

describe('GraphAnalysisWorkerCore', () => {
    it('fail-closed: unknown type -> ERROR', () => {
        const res = handleGraphWorkerMessage(msg('UNKNOWN' as any, [], []));
        expect(res.type).toBe('ERROR');
        expect(res.payload.message).toMatch(/Unsupported graph worker message type/i);
    });

    it('strict edges: missing node -> ERROR', () => {
        const res = handleGraphWorkerMessage(msg('PAGERANK', ['A'], [['A', 'B']], { edgePolicy: 'strict' }));
        expect(res.type).toBe('ERROR');
        expect(res.payload.message).toMatch(/Missing target node: B/i);
    });

    it('tolerant edges: missing node -> AUTO-REPAIR', () => {
        const res = handleGraphWorkerMessage(msg('PAGERANK', ['A'], [['A', 'B']], { edgePolicy: 'tolerant' }));
        expect(res.type).toBe('RESULT');
        // PageRank should have results for both A and B
        expect(res.payload.data).toHaveProperty('A');
        expect(res.payload.data).toHaveProperty('B');
    });

    it('guardrail: too many nodes -> ERROR (BETWEENNESS)', () => {
        // Betweenness default limit is 2500
        const nodes = Array.from({ length: 2501 }, (_, i) => `N${i}`);
        const res = handleGraphWorkerMessage(msg('BETWEENNESS', nodes, []));
        expect(res.type).toBe('ERROR');
        expect(res.payload.message).toMatch(/too large for BETWEENNESS/i);
    });

    it('guardrail: too many edges -> ERROR (MAX_EDGES)', () => {
        // numOpt clamps to min 1, so we need 2 edges to trigger "too dense" with maxEdges: 1
        const res = handleGraphWorkerMessage(
            msg(
                'FULL_ANALYSIS',
                ['A', 'B', 'C'],
                [
                    ['A', 'B'],
                    ['B', 'C'],
                ],
                { maxEdges: 1 },
            ),
        );
        expect(res.type).toBe('ERROR');
        expect(res.payload.message).toMatch(/too dense/i);
    });

    it('functional: PAGERANK basic', () => {
        const res = handleGraphWorkerMessage(msg('PAGERANK', ['A', 'B'], [['A', 'B']]));
        expect(res.type).toBe('RESULT');
        const data = res.payload.data as Record<string, number>;
        expect(data['B']).toBeGreaterThan(data['A']);
    });

    it('functional: COMMUNITY basic', () => {
        const res = handleGraphWorkerMessage(
            msg(
                'COMMUNITY',
                ['A', 'B', 'C', 'D'],
                [
                    ['A', 'B'],
                    ['C', 'D'],
                ],
            ),
        );
        expect(res.type).toBe('RESULT');
        const data = res.payload.data as Record<string, number>;
        expect(data['A']).toBe(data['B']);
        expect(data['C']).toBe(data['D']);
        expect(data['A']).not.toBe(data['C']);
    });
});
