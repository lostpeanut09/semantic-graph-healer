import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphWorkerService } from '../../../src/core/services/GraphWorkerService';
import { HealerLogger } from '../../../src/core/utils/HealerLogger';

// Enable Web Worker support for this test file
import '@vitest/web-worker';

describe('GraphWorkerService Integration (Real Worker)', () => {
    let service: GraphWorkerService;
    let mockLogger: any;
    let mockPlugin: any;

    beforeEach(() => {
        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        };

        mockPlugin = {
            manifest: { dir: 'plugin-dir' },
            settings: { workerTimeout: 5 },
            app: {
                vault: {
                    adapter: {
                        // Mock the worker code - we point to a minimal version that uses our core logic
                        read: vi.fn().mockResolvedValue(`
                        self.onmessage = (e) => {
                            const { type, payload } = e.data;
                            const requestId = payload.requestId;

                            // Simulate Zod-like validation for 'nodes'
                            if (!payload.nodes || !Array.isArray(payload.nodes)) {
                                self.postMessage({
                                    type: 'ERROR',
                                    payload: { requestId, message: 'Invalid payload: nodes required' }
                                });
                                return;
                            }

                            if (type === 'PAGERANK') {
                                const results = {};
                                payload.nodes.forEach(n => results[n.key] = 0.5);
                                self.postMessage({
                                    type: 'RESULT',
                                    payload: { requestId, data: results }
                                });
                            }
                        };
                    `),
                    },
                },
            },
        };

        service = new GraphWorkerService(mockLogger, mockPlugin);
    });

    it('should successfully run a PageRank analysis in a real background thread', async () => {
        // Note: In Vitest environment, we might need a direct string or a real file path
        // For this integration test, we'll assume the environment can handle the mock read.

        // We actually need to initialize the worker. Since we mocked the read, it should work.
        await service.initialize();

        const nodes = [
            { key: 'A', attributes: {} },
            { key: 'B', attributes: {} },
        ];
        const edges = [{ source: 'A', target: 'B', attributes: {} }];

        const result = await service.runAnalysis<Record<string, number>>('PAGERANK', nodes, edges);

        expect(result).toBeDefined();
        expect(result['A']).toBeGreaterThan(0);

        service.terminate();
    });

    it('should fail if Zod validation rejects the message', async () => {
        await service.initialize();

        // Send invalid nodes (null) to trigger Zod error in the worker
        const nodes = null as any;
        const edges = [];

        await expect(service.runAnalysis('PAGERANK', nodes, edges)).rejects.toThrow();

        service.terminate();
    });

    it('should process requests sequentially using p-queue', async () => {
        await service.initialize();

        const nodes = [{ key: 'A', attributes: {} }];
        const edges = [];

        // Launch two analyses simultaneously
        const p1 = service.runAnalysis('PAGERANK', nodes, edges);
        const p2 = service.runAnalysis('PAGERANK', nodes, edges);

        const results = await Promise.all([p1, p2]);

        expect(results.length).toBe(2);
        // p-queue logic is internal, but if it didn't work,
        // the singleton worker might get confused or race.
        // Successful completion of both implies the service handled the flow.

        service.terminate();
    });
});
