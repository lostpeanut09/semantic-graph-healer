import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LadybugService } from '../../../src/core/services/LadybugService';

// Mock Worker
class MockWorker {
    onmessage: ((ev: MessageEvent) => any) | null = null;
    handlers: Set<(ev: MessageEvent) => any> = new Set();
    postMessage = vi.fn();
    terminate = vi.fn();

    addEventListener(type: string, handler: (ev: MessageEvent) => any) {
        this.handlers.add(handler);
    }

    removeEventListener(type: string, handler: (ev: MessageEvent) => any) {
        this.handlers.delete(handler);
    }

    dispatchEvent(data: any) {
        const ev = { data } as MessageEvent;
        this.onmessage?.(ev);
        this.handlers.forEach((h) => h(ev));
    }
}

global.Worker = MockWorker as any;

describe('LadybugService', () => {
    let service: LadybugService;

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset SharedArrayBuffer
        (global as any).SharedArrayBuffer = class {};
    });

    async function fastForwardInit(service: LadybugService) {
        const initPromise = service.initialize();
        const worker = (service as any).worker as MockWorker;
        worker.dispatchEvent({ type: 'ready', mode: 'st-wasm' });
        await initPromise;
        return worker;
    }

    it('exposes initialization states: none -> loading -> ready', async () => {
        service = new LadybugService();
        expect(service.initializationStatus).toBe('none');

        const initPromise = service.initialize();
        expect(service.initializationStatus).toBe('loading');

        // Simulate worker ready message
        const worker = (service as any).worker as MockWorker;
        worker.dispatchEvent({ type: 'ready', mode: 'mt-wasm' });

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

        worker.dispatchEvent({ type: 'ready', mode: 'st-wasm' });
        await initPromise;
        expect(service.initializationStatus).toBe('ready');
    });

    it('falls back to Legacy if WASM fails entirely', async () => {
        service = new LadybugService();
        const initPromise = service.initialize();

        const worker = (service as any).worker as MockWorker;
        worker.dispatchEvent({ type: 'error', message: 'WASM Load Failed' });

        await expect(initPromise).rejects.toThrow('WASM Load Failed');
        expect(service.initializationStatus).toBe('legacy');
    });

    it('reports init-progress messages', async () => {
        service = new LadybugService();
        service.initialize();

        const worker = (service as any).worker as MockWorker;

        worker.dispatchEvent({ type: 'init-progress', progress: 50 });
        expect(service.loadingProgress).toBe(50);
    });

    it('successfully executes a query', async () => {
        service = new LadybugService();
        const worker = await fastForwardInit(service);

        const queryPromise = service.query('MATCH (n) RETURN n');
        worker.dispatchEvent({ type: 'query-result', rows: [{ id: 1 }] });

        const result = await queryPromise;
        expect(result).toEqual([{ id: 1 }]);
        expect(worker.postMessage).toHaveBeenCalledWith({ type: 'query', query: 'MATCH (n) RETURN n', params: {} });
    });

    it('successfully executes a sync', async () => {
        service = new LadybugService();
        const worker = await fastForwardInit(service);

        const syncPromise = service.sync([{ type: 'node', data: [] }]);
        worker.dispatchEvent({ type: 'sync-complete' });

        await syncPromise;
        expect(worker.postMessage).toHaveBeenCalledWith({ type: 'sync', batch: [{ type: 'node', data: [] }] });
    });

    it('successfully runs an algorithm', async () => {
        service = new LadybugService();
        const worker = await fastForwardInit(service);

        const algoPromise = service.runAlgo('pagerank');
        worker.dispatchEvent({ type: 'algo-result', result: { 'node1.md': 0.5 } });

        const result = await algoPromise;
        expect(result).toEqual({ 'node1.md': 0.5 });
        expect(worker.postMessage).toHaveBeenCalledWith({ type: 'algo', algoName: 'pagerank' });
    });

    it('throws error if methods called before initialization', async () => {
        service = new LadybugService();
        await expect(service.query('MATCH (n) RETURN n')).rejects.toThrow('LadybugDB not ready');
        await expect(service.sync([])).rejects.toThrow('LadybugDB not ready');
        await expect(service.runAlgo('pagerank')).rejects.toThrow('LadybugDB not ready');
    });

    it('propagates worker errors to the caller', async () => {
        service = new LadybugService();
        const worker = await fastForwardInit(service);

        const queryPromise = service.query('INVALID QUERY');
        worker.dispatchEvent({ type: 'error', message: 'Syntax Error' });

        await expect(queryPromise).rejects.toThrow('Syntax Error');
    });
});
