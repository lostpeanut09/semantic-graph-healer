import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AjsonStorage } from '../../src/core/utils/AjsonStorage';
import { LlmService } from '../../src/core/LlmService';
import { handleGraphWorkerMessage } from '../../src/core/workers/graph-analysis-core';
import { requestUrl } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../src/types';

vi.mock('obsidian', () => ({
    requestUrl: vi.fn(),
}));

describe('Performance & Resource Audit Benchmarks', () => {
    describe('AjsonStorage Memory Footprint (Large Load)', () => {
        it('should handle reading 5000 lines of JSON without failure', async () => {
            const mockAdapter = {
                exists: vi.fn().mockResolvedValue(true),
                read: vi.fn(),
                write: vi.fn(),
                append: vi.fn(),
            };
            const storage = new AjsonStorage(mockAdapter as any);

            // Generate 5000 lines of entity data
            const lines = [];
            for (let i = 0; i < 5000; i++) {
                lines.push(
                    JSON.stringify({ id: `entity_${i}`, name: `Entity Name ${i}`, type: 'Person', community: i % 10 }),
                );
            }
            const content = lines.join('\n') + '\n';
            mockAdapter.read.mockResolvedValue(content);

            const startMemory = process.memoryUsage().heapUsed;
            const result = await storage.readAll('entities.ajson');
            const endMemory = process.memoryUsage().heapUsed;

            expect(result).toHaveLength(5000);
            expect(result[0]).toHaveProperty('id', 'entity_0');

            const memoryDiffMb = (endMemory - startMemory) / 1024 / 1024;
            console.log(`AjsonStorage ReadAll (5000 items) memory diff: ${memoryDiffMb.toFixed(2)} MB`);
            // We don't assert strict memory limits because GC is non-deterministic,
            // but we ensure it completes and returns data.
        });
    });

    describe('LLM Cost Reduction (Stage 0 Bypass Rate)', () => {
        it('should bypass LLM calls for unrelated content (Similarity < 0.4)', async () => {
            const mockSettings = {
                ...DEFAULT_SETTINGS,
                enableAiTribunal: true,
                llmEndpoint: 'https://api.openai.com/v1',
                llmModelName: 'test-model',
            };
            const service = new LlmService(mockSettings, async () => 'test-key');

            vi.mocked(requestUrl).mockResolvedValue({
                status: 200,
                json: { choices: [{ message: { content: 'WINNER: A | SCORE: 90 | WHY: Match' } }] },
            } as any);

            let bypassCount = 0;
            let callCount = 0;

            // 100 pairs: 70 unrelated, 30 related
            for (let i = 0; i < 100; i++) {
                const isRelated = i >= 70;
                const embeddings = {
                    source: [1, 0, 0],
                    target: isRelated ? [1, 0.1, 0] : [0, 1, 0], // Related vs Orthogonal
                };

                const result = await service.callLlm('test prompt', true, undefined, embeddings);
                if (result.includes('Status: REJECTED') && result.includes('SEMANTIC_UNRELATED')) {
                    bypassCount++;
                }
                if (vi.mocked(requestUrl).mock.calls.length > callCount) {
                    callCount = vi.mocked(requestUrl).mock.calls.length;
                }
            }

            console.log(`LLM Stage 0 Bypass Rate: ${bypassCount}% (${bypassCount}/100)`);
            expect(bypassCount).toBe(70); // Exactly the number of unrelated pairs
            expect(callCount).toBe(30); // Exactly the number of related pairs that reached LLM
        });
    });

    describe('HTR v2 Convergence Time (Large Graph)', () => {
        it('should execute PageRank with HTR v2 vector weighting in reasonable time', () => {
            const nodeCount = 1000;
            const edgeCount = 3000;

            const nodes = [];
            const embeddings: Record<string, number[]> = {};
            for (let i = 0; i < nodeCount; i++) {
                const key = `N${i}`;
                nodes.push({ key, attributes: {} });
                embeddings[key] = [Math.random(), Math.random(), Math.random()];
            }

            const edges = [];
            for (let i = 0; i < edgeCount; i++) {
                edges.push({
                    source: `N${Math.floor(Math.random() * nodeCount)}`,
                    target: `N${Math.floor(Math.random() * nodeCount)}`,
                    attributes: { weight: 1.0 },
                });
            }

            const messageBase = {
                type: 'PAGERANK' as const,
                payload: { nodes, edges, requestId: 'bench-1' },
                options: { weightAttribute: 'weight' },
            };

            // 1. Pure Structural
            const start1 = performance.now();
            handleGraphWorkerMessage({ ...messageBase, options: { ...messageBase.options, htrStructuralWeight: 1.0 } });
            const end1 = performance.now();
            const timeStructural = end1 - start1;

            // 2. HTR v2 (Vector Weighted)
            const start2 = performance.now();
            handleGraphWorkerMessage({
                ...messageBase,
                options: { ...messageBase.options, htrStructuralWeight: 0.5, embeddings },
            });
            const end2 = performance.now();
            const timeHtrV2 = end2 - start2;

            console.log(`HTR v2 PageRank (1000 nodes, 3000 edges):`);
            console.log(`  Structural: ${timeStructural.toFixed(2)}ms`);
            console.log(`  HTR v2:     ${timeHtrV2.toFixed(2)}ms`);

            expect(timeHtrV2).toBeLessThan(timeStructural * 5); // Allow some overhead for vector ops, but not exponential
        });
    });
});
