import { describe, it, expect, vi } from 'vitest';
import { handleGraphWorkerMessage } from '../../../src/core/workers/graph-analysis-core';
import type { WorkerMessage } from '../../../src/core/workers/graph-analysis-core';

describe('GraphAnalysisCore HTR v2 (Vector-Weighted Centrality)', () => {
    const mockEmbeddings = {
        A: [1, 0, 0],
        B: [1, 0, 0], // High similarity with A
        C: [0, 1, 0], // Low similarity with A
    };

    const payload = {
        nodes: [
            { key: 'A', attributes: {} },
            { key: 'B', attributes: {} },
            { key: 'C', attributes: {} },
        ],
        edges: [
            { source: 'A', target: 'B', attributes: { weight: 1.0 } },
            { source: 'A', target: 'C', attributes: { weight: 1.0 } },
        ],
        requestId: 'htrv2-test',
    };

    it('should incorporate vector similarity into edge weights when htrStructuralWeight < 1.0', () => {
        // With htrStructuralWeight = 0.5:
        // Edge A->B similarity = 1.0 (cosine [1,0,0] and [1,0,0])
        // Edge A->B final weight = 1.0 * 0.5 + 1.0 * 0.5 = 1.0

        // Edge A->C similarity = 0.0 (cosine [1,0,0] and [0,1,0])
        // Edge A->C final weight = 1.0 * 0.5 + 0.0 * 0.5 = 0.5

        const message: WorkerMessage = {
            type: 'PAGERANK',
            payload: payload,
            options: {
                htrStructuralWeight: 0.5,
                embeddings: mockEmbeddings,
                weightAttribute: 'weight',
            },
        };

        const response = handleGraphWorkerMessage(message);
        expect(response.type).toBe('RESULT');

        if (response.type === 'RESULT') {
            const data = response.payload.data as Record<string, number>;
            // Node B should have higher PageRank than Node C because Edge A->B has higher weight
            expect(data['B']).toBeGreaterThan(data['C']);
        }
    });

    it('should default to structural weight if embeddings are missing', () => {
        const message: WorkerMessage = {
            type: 'PAGERANK',
            payload: payload,
            options: {
                htrStructuralWeight: 0.5,
                // embeddings missing
            },
        };

        const response = handleGraphWorkerMessage(message);
        expect(response.type).toBe('RESULT');

        if (response.type === 'RESULT') {
            const data = response.payload.data as Record<string, number>;
            // Node B and C should have identical PageRank because weights remain equal
            expect(Math.abs(data['B'] - data['C'])).toBeLessThan(0.0001);
        }
    });

    it('should use pure structural weight if htrStructuralWeight is 1.0', () => {
        const message: WorkerMessage = {
            type: 'PAGERANK',
            payload: payload,
            options: {
                htrStructuralWeight: 1.0,
                embeddings: mockEmbeddings,
            },
        };

        const response = handleGraphWorkerMessage(message);
        expect(response.type).toBe('RESULT');

        if (response.type === 'RESULT') {
            const data = response.payload.data as Record<string, number>;
            // Node B and C should have identical PageRank because similarity is ignored
            expect(Math.abs(data['B'] - data['C'])).toBeLessThan(0.0001);
        }
    });
});
