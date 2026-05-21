import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LadybugService } from './LadybugService';

// Mock Worker
class MockWorker {
    onmessage: ((ev: MessageEvent) => any) | null = null;
    postMessage = vi.fn();
    terminate = vi.fn();
}

global.Worker = MockWorker as any;

describe('LadybugService', () => {
    let service: LadybugService;

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset SharedArrayBuffer
        (global as any).SharedArrayBuffer = class {};
    });

    it('exposes initialization states: none -> loading -> ready', async () => {
        service = new LadybugService();
        expect(service.initializationStatus).toBe('none');

        const initPromise = service.initialize();
        expect(service.initializationStatus).toBe('loading');

        // Simulate worker ready message
        const worker = (service as any).worker as MockWorker;
        worker.onmessage?.({ data: { type: 'ready', mode: 'mt-wasm' } } as MessageEvent);

        await initPromise;
        expect(service.initializationStatus).toBe('ready');
    });

    it('falls back to Single-Threaded mode if SharedArrayBuffer is missing', async () => {
        // Remove SharedArrayBuffer
        (global as any).SharedArrayBuffer = undefined;

        service = new LadybugService();
        const initPromise = service.initialize();

        const worker = (service as any).worker as MockWorker;
        expect(worker.postMessage).toHaveBeenCalledWith({ type: 'init', useSharedArrayBuffer: false });

        worker.onmessage?.({ data: { type: 'ready', mode: 'st-wasm' } } as MessageEvent);
        await initPromise;
        expect(service.initializationStatus).toBe('ready');
    });

    it('falls back to Legacy if WASM fails entirely', async () => {
        service = new LadybugService();
        const initPromise = service.initialize();

        const worker = (service as any).worker as MockWorker;
        worker.onmessage?.({ data: { type: 'error', message: 'WASM Load Failed' } } as MessageEvent);

        await expect(initPromise).rejects.toThrow('WASM Load Failed');
        expect(service.initializationStatus).toBe('legacy');
    });

    it('reports init-progress messages', async () => {
        service = new LadybugService();
        service.initialize();

        const worker = (service as any).worker as MockWorker;
        
        // Mock a progress listener or check internal state if exposed
        // For this test, let's assume it updates a progress property
        worker.onmessage?.({ data: { type: 'init-progress', progress: 50 } } as MessageEvent);
        expect(service.loadingProgress).toBe(50);
    });
});
