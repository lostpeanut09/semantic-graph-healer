import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LadybugService } from '../../../src/core/services/LadybugService';
import type { App } from 'obsidian';
import type { ExtendedManifest } from '../../../src/types';

// Mock Worker
class MockWorker {
    onmessage: ((ev: MessageEvent) => unknown) | null = null;
    handlers: Set<(ev: MessageEvent) => unknown> = new Set();
    postMessage = vi.fn();
    terminate = vi.fn();

    addEventListener(_type: string, handler: (ev: MessageEvent) => unknown) {
        this.handlers.add(handler);
    }

    removeEventListener(_type: string, handler: (ev: MessageEvent) => unknown) {
        this.handlers.delete(handler);
    }

    dispatchEvent(data: unknown) {
        const ev = { data } as MessageEvent;
        this.onmessage?.(ev);
        this.handlers.forEach((h) => h(ev));
    }
}

global.Worker = MockWorker as unknown as typeof global.Worker;

describe('LadybugService', () => {
    let service: LadybugService;
    let mockApp: App;
    let mockManifest: ExtendedManifest;

    beforeEach(() => {
        vi.clearAllMocks();
        mockApp = {
            vault: {
                adapter: {
                    read: vi.fn().mockResolvedValue('// mock worker content'),
                },
            },
        } as unknown as App;
        mockManifest = { id: 'semantic-graph-healer', dir: 'plugin-dir' };
        // Reset SharedArrayBuffer
        (global as unknown as { SharedArrayBuffer: unknown }).SharedArrayBuffer = class {};
    });

    async function fastForwardInit(service: LadybugService) {
        const initPromise = service.initialize();
        // Wait a tick for async worker creation
        await new Promise((resolve) => setTimeout(resolve, 0));
        const worker = (service as unknown as { worker: MockWorker }).worker;
        worker.dispatchEvent({ type: 'ready', mode: 'st-wasm' });
        await initPromise;
        return worker;
    }

    it('exposes initialization states: none -> loading -> ready', async () => {
        service = new LadybugService(mockApp, mockManifest);
        expect(service.initializationStatus).toBe('none');

        const initPromise = service.initialize();
        expect(service.initializationStatus).toBe('loading');

        // Wait a tick for async worker creation
        await new Promise((resolve) => setTimeout(resolve, 0));

        // Simulate worker ready message
        const worker = (service as unknown as { worker: MockWorker }).worker;
        worker.dispatchEvent({ type: 'ready', mode: 'mt-wasm' });

        await initPromise;
        expect(service.initializationStatus).toBe('ready');
    });

    it('falls back to Single-Threaded mode if SharedArrayBuffer is missing', async () => {
        // Remove SharedArrayBuffer
        (global as unknown as { SharedArrayBuffer: unknown }).SharedArrayBuffer = undefined;

        service = new LadybugService(mockApp, mockManifest);
        const initPromise = service.initialize();

        // Wait a tick for async worker creation
        await new Promise((resolve) => setTimeout(resolve, 0));

        const worker = (service as unknown as { worker: MockWorker }).worker;
        expect(worker.postMessage).toHaveBeenCalledWith({
            type: 'init',
            useSharedArrayBuffer: false,
        });

        worker.dispatchEvent({ type: 'ready', mode: 'st-wasm' });
        await initPromise;
        expect(service.initializationStatus).toBe('ready');
    });

    it('falls back to Legacy if WASM fails entirely', async () => {
        service = new LadybugService(mockApp, mockManifest);
        const initPromise = service.initialize();

        // Wait a tick for async worker creation
        await new Promise((resolve) => setTimeout(resolve, 0));

        const worker = (service as unknown as { worker: MockWorker }).worker;
        worker.dispatchEvent({ type: 'error', message: 'WASM Load Failed' });

        await expect(initPromise).rejects.toThrow('WASM Load Failed');
        expect(service.initializationStatus).toBe('legacy');
    });

    it('reports init-progress messages', async () => {
        service = new LadybugService(mockApp, mockManifest);
        void service.initialize();

        // Wait a tick for async worker creation
        await new Promise((resolve) => setTimeout(resolve, 0));

        const worker = (service as unknown as { worker: MockWorker }).worker;

        worker.dispatchEvent({ type: 'init-progress', progress: 50 });
        expect(service.loadingProgress).toBe(50);
    });

    it('successfully executes a query', async () => {
        service = new LadybugService(mockApp, mockManifest);
        const worker = await fastForwardInit(service);

        const queryPromise = service.query('MATCH (n) RETURN n');
        worker.dispatchEvent({ type: 'query-result', rows: [{ id: 1 }] });

        const result = await queryPromise;
        expect(result).toEqual([{ id: 1 }]);
        expect(worker.postMessage).toHaveBeenCalledWith({
            type: 'query',
            query: 'MATCH (n) RETURN n',
            params: {},
        });
    });

    it('successfully executes a sync', async () => {
        service = new LadybugService(mockApp, mockManifest);
        const worker = await fastForwardInit(service);

        const syncPromise = service.sync([{ type: 'node', data: [] }]);
        worker.dispatchEvent({ type: 'sync-complete' });

        await syncPromise;
        expect(worker.postMessage).toHaveBeenCalledWith({
            type: 'sync',
            batch: [{ type: 'node', data: [] }],
        });
    });

    it('successfully runs an algorithm', async () => {
        service = new LadybugService(mockApp, mockManifest);
        const worker = await fastForwardInit(service);

        const algoPromise = service.runAlgo('pagerank');
        worker.dispatchEvent({ type: 'algo-result', result: { 'node1.md': 0.5 } });

        const result = await algoPromise;
        expect(result).toEqual({ 'node1.md': 0.5 });
        expect(worker.postMessage).toHaveBeenCalledWith({
            type: 'algo',
            algoName: 'pagerank',
        });
    });

    it('throws error if methods called before initialization', async () => {
        service = new LadybugService(mockApp, mockManifest);
        await expect(service.query('MATCH (n) RETURN n')).rejects.toThrow('LadybugDB not ready');
        await expect(service.sync([])).rejects.toThrow('LadybugDB not ready');
        await expect(service.runAlgo('pagerank')).rejects.toThrow('LadybugDB not ready');
    });

    it('propagates worker errors to the caller', async () => {
        service = new LadybugService(mockApp, mockManifest);
        const worker = await fastForwardInit(service);

        const queryPromise = service.query('INVALID QUERY');
        worker.dispatchEvent({ type: 'error', message: 'Syntax Error' });

        await expect(queryPromise).rejects.toThrow('Syntax Error');
    });
});
