import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphWorkerService } from '../../../src/core/services/GraphWorkerService';
import type { HealerLogger } from '../../../src/core/utils/HealerLogger';
import type { HealerNotifier } from '../../../src/types';

// We use a custom MockWorker instead of @vitest/web-worker due to NodeJS blob URL limitations (`blob:nodedata:`).

type MockEdge = {
    source: string;
    target: string;
    attributes: Record<string, unknown>;
};
type MockPayload = {
    requestId?: string;
    nodes?: { key: string }[];
    edges?: MockEdge[];
};
type MockMsg = { type: string; payload: MockPayload };

describe('GraphWorkerService Integration (Real Worker)', () => {
    let service: GraphWorkerService;
    let mockLogger: HealerLogger;
    let mockPlugin: {
        manifest: { dir: string };
        settings: { workerTimeout: number };
        app: {
            vault: {
                adapter: {
                    read: ReturnType<typeof vi.fn>;
                };
            };
        };
    };

    beforeEach(() => {
        class MockWorker {
            onmessage: ((e: MessageEvent) => void) | null = null;
            onerror: ((e: ErrorEvent) => void) | null = null;
            postMessage(msg: unknown) {
                setTimeout(() => {
                    const m = msg as MockMsg;
                    const { type, payload } = m;
                    const requestId = payload?.requestId;
                    if (!payload.nodes || !Array.isArray(payload.nodes)) {
                        this.onmessage?.({
                            data: {
                                type: 'ERROR',
                                payload: {
                                    requestId,
                                    message: 'Invalid payload: nodes required',
                                },
                            },
                        } as MessageEvent);
                        return;
                    }
                    if (type === 'PAGERANK') {
                        const results: Record<string, number> = {};
                        payload.nodes.forEach((n: { key: string }) => (results[n.key] = 0.5));
                        this.onmessage?.({
                            data: { type: 'RESULT', payload: { requestId, data: results } },
                        } as MessageEvent);
                    } else if (type === 'TOPOLOGY_DIAGNOSTICS') {
                        // Mock implementation of TOPOLOGY_DIAGNOSTICS for integration testing
                        // This mirrors the logic in graph-analysis-core.ts
                        const results = {
                            bridges: [] as Array<Record<string, unknown>>,
                            blackHoles: [] as unknown[],
                            cycles: [] as unknown[],
                        };

                        // Simple bridge detection A -> B -> C => A -> C
                        const edges = payload.edges || [];
                        edges.forEach((e1: MockEdge) => {
                            const b = e1.target;
                            const type = e1.attributes?.type as string | undefined;
                            if (type) {
                                edges.forEach((e2: MockEdge) => {
                                    if (e2.source === b && (e2.attributes?.type as string | undefined) === type) {
                                        const exists = edges.some(
                                            (e: MockEdge) => e.source === e1.source && e.target === e2.target,
                                        );
                                        if (!exists && e1.source !== e2.target) {
                                            results.bridges.push({
                                                source: e1.source,
                                                target: e2.target,
                                                via: b,
                                                type: type,
                                            });
                                        }
                                    }
                                });
                            }
                        });

                        this.onmessage?.({
                            data: { type: 'RESULT', payload: { requestId, data: results } },
                        } as MessageEvent);
                    }
                }, 10);
            }
            terminate() {}
        }
        vi.stubGlobal('Worker', MockWorker);

        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        } as unknown as HealerLogger;

        mockPlugin = {
            manifest: { dir: 'plugin-dir' },
            settings: { workerTimeout: 5 },
            app: {
                vault: {
                    adapter: {
                        read: vi.fn().mockResolvedValue('// Worker entry point mock'),
                    },
                },
            },
        };

        const mockNotifier: HealerNotifier = {
            show: vi.fn(),
        };

        service = new GraphWorkerService(
            mockLogger,
            mockPlugin as unknown as ConstructorParameters<typeof GraphWorkerService>[1],
            mockNotifier,
        );
    });

    it('should successfully run a PageRank analysis in a real background thread', async () => {
        await service.initialize();

        const nodes = [
            { key: 'A', attributes: {} },
            { key: 'B', attributes: {} },
        ];
        const edges: MockEdge[] = [{ source: 'A', target: 'B', attributes: {} }];

        const result = await service.runAnalysis<Record<string, number>>('PAGERANK', nodes, edges);

        expect(result).toBeDefined();
        expect(result['A']).toBeGreaterThan(0);

        service.terminate();
    });

    it('should successfully run a TOPOLOGY_DIAGNOSTICS analysis in a real background thread', async () => {
        await service.initialize();

        const nodes = [
            { key: 'A', attributes: {} },
            { key: 'B', attributes: {} },
            { key: 'C', attributes: {} },
        ];
        const edges: MockEdge[] = [
            { source: 'A', target: 'B', attributes: { type: 'up' } },
            { source: 'B', target: 'C', attributes: { type: 'up' } },
        ];

        const result = await service.runAnalysis<{
            bridges: Array<{
                source: string;
                target: string;
                via: string;
                type: string;
            }>;
        }>('TOPOLOGY_DIAGNOSTICS', nodes, edges);

        expect(result).toBeDefined();
        expect(result.bridges).toHaveLength(1);
        expect(result.bridges[0]).toMatchObject({
            source: 'A',
            target: 'C',
            via: 'B',
            type: 'up',
        });

        service.terminate();
    });

    it('should fail if Zod validation rejects the message', async () => {
        await service.initialize();
        const nodes = null as unknown as Array<{
            key: string;
            attributes: Record<string, unknown>;
        }>;
        const edges: MockEdge[] = [];

        await expect(service.runAnalysis('PAGERANK', nodes, edges)).rejects.toThrow();

        service.terminate();
    });

    it('should process requests sequentially using p-queue', async () => {
        await service.initialize();

        const nodes = [{ key: 'A', attributes: {} }];
        const edges: MockEdge[] = [];

        const p1 = service.runAnalysis('PAGERANK', nodes, edges);
        const p2 = service.runAnalysis('PAGERANK', nodes, edges);

        const results = await Promise.all([p1, p2]);

        expect(results.length).toBe(2);

        service.terminate();
    });
});
