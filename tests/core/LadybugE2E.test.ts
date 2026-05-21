import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LadybugService } from '../../src/core/services/LadybugService';
import { LadybugAdapter } from '../../src/core/adapters/LadybugAdapter';
import { UnifiedMetadataAdapter } from '../../src/core/adapters/UnifiedMetadataAdapter';

// Enhanced Mock Worker that simulates the internal state of the worker
class MockWorker {
    onmessage: ((ev: MessageEvent) => any) | null = null;
    handlers: Set<(ev: MessageEvent) => any> = new Set();
    nodes: any[] = [];
    links: any[] = [];

    addEventListener(type: string, handler: (ev: MessageEvent) => any) {
        this.handlers.add(handler);
    }

    removeEventListener(type: string, handler: (ev: MessageEvent) => any) {
        this.handlers.delete(handler);
    }

    postMessage(msg: any) {
        // Simulate asynchronous worker response
        setTimeout(() => {
            if (msg.type === 'init') {
                this.dispatchEvent({ type: 'init-progress', progress: 50 });
                setTimeout(() => this.dispatchEvent({ type: 'ready', mode: 'st-wasm' }), 10);
            } else if (msg.type === 'sync') {
                msg.batch.forEach((item: any) => {
                    if (item.type === 'node') this.nodes.push(...item.data);
                    if (item.type === 'link') this.links.push(...item.data);
                });
                this.dispatchEvent({ type: 'sync-complete' });
            } else if (msg.type === 'query') {
                // Simple Cypher simulator for E2E verification
                let rows: any[] = [];
                if (msg.query.includes('SIZE([ (n)-[]->() | n ]) = 0')) {
                    // Find Black Holes (nodes with no out-links)
                    const nodePathsWithOutLinks = new Set(this.links.map(l => l.from));
                    rows = this.nodes
                        .filter(n => !nodePathsWithOutLinks.has(n.path))
                        .map(n => ({ path: n.path }));
                } else if (msg.query.includes('MATCH (a:Node)-[r1]->(b:Node)-[r2]->(c:Node)')) {
                    // Find Bridges
                    rows = [{ path: 'bridge.md' }];
                }
                this.dispatchEvent({ type: 'query-result', rows });
            } else if (msg.type === 'algo') {
                const result = msg.algoName === 'pagerank' ? { 'a.md': 0.1 } : { 'a.md': 0 };
                this.dispatchEvent({ type: 'algo-result', result });
            }
        }, 10);
    }

    dispatchEvent(data: any) {
        const ev = { data } as MessageEvent;
        this.onmessage?.(ev);
        this.handlers.forEach((h) => h(ev));
    }

    terminate() {}
}

global.Worker = MockWorker as any;

describe('Ladybug E2E Flow', () => {
    let service: LadybugService;
    let metadataAdapter: UnifiedMetadataAdapter;
    let ladybugAdapter: LadybugAdapter;

    beforeEach(() => {
        service = new LadybugService();
        metadataAdapter = {
            getLinksSafe: vi.fn().mockResolvedValue([
                { sourcePath: 'node1.md', targetPath: 'node2.md', type: 'related', confidence: 1.0 }
            ]),
            queryPages: vi.fn().mockResolvedValue([
                { file: { path: 'node1.md', name: 'Node 1', size: 100 } },
                { file: { path: 'node2.md', name: 'Node 2', size: 200 } }
            ]),
        } as any;
        ladybugAdapter = new LadybugAdapter(service, metadataAdapter);
    });

    it('successfully performs a full analysis cycle', async () => {
        // 1. Initialization & Ingestion
        await ladybugAdapter.initialize();
        expect(service.initializationStatus).toBe('ready');

        // 2. Verify Data Ingestion (via Query)
        // Note: Our mock simulator handles the 'Black Hole' query
        // node2.md has no out-links, so it should be a black hole
        const blackHoles = await ladybugAdapter.findBlackHoles(0);
        expect(blackHoles).toContain('node2.md');
        expect(blackHoles).not.toContain('node1.md');

        // 3. Verify Algorithms
        const pagerank = await ladybugAdapter.getPageRank();
        expect(pagerank).toHaveProperty('a.md');

        // 4. Verify Lifecycle
        service.terminate();
        expect(service.initializationStatus).toBe('none');
    });
});
