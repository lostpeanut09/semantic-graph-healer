// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// Mocks
vi.mock('../../../src/core/utils/HealerLogger', () => ({
    HealerLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { mockPlatform, mockWorker } = vi.hoisted(() => ({
    mockPlatform: { isMobile: false },
    mockWorker: {
        postMessage: vi.fn(),
        terminate: vi.fn(),
        onmessage: null as any,
        onerror: null as any,
    },
}));

vi.mock('obsidian', () => ({
    App: class MockApp {},
    Platform: mockPlatform,
}));

global.Worker = class MockWorker {
    onmessage: any = null;
    onerror: any = null;
    postMessage() {}
    terminate() {
        mockWorker.terminate();
    }
} as any;
if (!global.URL) {
    global.URL = {} as any;
}
global.URL.createObjectURL = vi.fn(() => 'blob:mock-worker-url');
global.URL.revokeObjectURL = vi.fn();

import { GraphWorkerService } from '../../../src/core/services/GraphWorkerService';
import { HealerLogger } from '../../../src/core/utils/HealerLogger';

function makePlugin() {
    return {
        manifest: { dir: '/mock/dir' },
        app: {
            vault: {
                adapter: {
                    read: vi.fn().mockResolvedValue('console.log("worker mock");'),
                },
            },
        } as any,
        settings: { workerTimeout: 120 } as any,
    };
}

describe('GraphWorkerService', () => {
    afterEach(() => {
        vi.clearAllMocks();
        mockPlatform.isMobile = false;
    });

    describe('terminate() CRIT-2', () => {
        it('rejects all pending promises before clearing', async () => {
            const plugin = makePlugin();
            const loggerMock = {
                info: vi.fn(),
                debug: vi.fn(),
                error: vi.fn(),
                warn: vi.fn(),
            } as unknown as HealerLogger;
            const service = new GraphWorkerService(loggerMock, plugin);

            await service.initialize();

            // Trigger a pending request
            const promise = service.runAnalysis('SIMILARITY', [], [], {});

            // Call terminate
            service.terminate();

            // Ensure the promise is rejected immediately
            await expect(promise).rejects.toThrow(/Worker terminated/);

            // Check memory cleanup
            expect(mockWorker.terminate).toHaveBeenCalled();
            expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-worker-url');
        });
    });

    describe('initialize() MED-1', () => {
        it('revokes blob URL if Worker constructor fails', async () => {
            const plugin = makePlugin();
            const loggerMock = {
                info: vi.fn(),
                debug: vi.fn(),
                error: vi.fn(),
                warn: vi.fn(),
            } as unknown as HealerLogger;
            const service = new GraphWorkerService(loggerMock, plugin);

            const originalWorker = global.Worker;
            global.Worker = class {
                constructor() {
                    throw new Error('Worker constructor crash');
                }
            } as any;

            try {
                await service.initialize();
            } finally {
                global.Worker = originalWorker;
            }

            expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-worker-url');
            // Can't check private field .workerUrl easily, but the revoke logic is what matters
        });
    });

    describe('handleWorkerError (fail-fast)', () => {
        it('rejects pending requests immediately upon worker error', async () => {
            const plugin = makePlugin();
            const loggerMock = {
                info: vi.fn(),
                debug: vi.fn(),
                error: vi.fn(),
                warn: vi.fn(),
            } as unknown as HealerLogger;
            const service = new GraphWorkerService(loggerMock, plugin);

            await service.initialize();

            // Trigger a pending request
            const promise = service.runAnalysis('SIMILARITY', [], [], {});

            // Simulate worker throwing an error event
            const workerInstance = (service as any).worker;

            if (workerInstance && workerInstance.onerror) {
                workerInstance.onerror({
                    message: 'Fatal exception in thread',
                    filename: 'worker.js',
                    lineno: 42,
                } as ErrorEvent);
            }

            // Ensure the promise is rejected immediately due to fail-fast
            await expect(promise).rejects.toThrow(/Worker error: Fatal exception/);
        });
    });
});
