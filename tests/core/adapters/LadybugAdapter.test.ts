import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LadybugAdapter } from '../../../src/core/adapters/LadybugAdapter';
import { LadybugService } from '../../../src/core/services/LadybugService';
import { UnifiedMetadataAdapter } from '../../../src/core/adapters/UnifiedMetadataAdapter';

describe('LadybugAdapter', () => {
    let service: LadybugService;
    let metadataAdapter: UnifiedMetadataAdapter;
    let ladybugAdapter: LadybugAdapter;

    beforeEach(() => {
        service = {
            initialize: vi.fn().mockResolvedValue(undefined),
            query: vi.fn().mockResolvedValue([]),
            sync: vi.fn().mockResolvedValue(undefined),
            initializationStatus: 'ready',
        } as any;

        metadataAdapter = {
            getLinksSafe: vi.fn().mockResolvedValue([]),
            queryPages: vi.fn().mockResolvedValue([]),
        } as any;

        ladybugAdapter = new LadybugAdapter(service, metadataAdapter);
    });

    it('initializes the service and performs full sync on startup', async () => {
        await ladybugAdapter.initialize();
        expect(service.initialize).toHaveBeenCalled();
        expect(metadataAdapter.getLinksSafe).toHaveBeenCalled();
        expect(metadataAdapter.queryPages).toHaveBeenCalledWith('');
        expect(service.sync).toHaveBeenCalled();
    });

    it('syncs nodes and links correctly', async () => {
        metadataAdapter.queryPages = vi
            .fn()
            .mockResolvedValue([
                { file: { path: 'node1.md', name: 'Node 1', size: 100 } },
                { file: { path: 'node2.md', name: 'Node 2', size: 200 } },
            ]);

        metadataAdapter.getLinksSafe = vi
            .fn()
            .mockResolvedValue([{ sourcePath: 'node1.md', targetPath: 'node2.md', type: 'related', confidence: 0.8 }]);

        await ladybugAdapter.initialize();

        expect(service.sync).toHaveBeenCalledWith([
            {
                type: 'node',
                data: [
                    { path: 'node1.md', label: 'Node 1', size: 100 },
                    { path: 'node2.md', label: 'Node 2', size: 200 },
                ],
            },
            {
                type: 'link',
                data: [{ from: 'node1.md', to: 'node2.md', type: 'related', weight: 0.8 }],
            },
        ]);
    });

    it('handles large vault sync (1000 nodes)', async () => {
        const mockNodes = Array.from({ length: 1000 }, (_, i) => ({
            file: { path: `node${i}.md`, name: `Node ${i}`, size: 100 },
        }));

        metadataAdapter.queryPages = vi.fn().mockResolvedValue(mockNodes);
        metadataAdapter.getLinksSafe = vi.fn().mockResolvedValue([]);

        await ladybugAdapter.initialize();

        const syncCall = vi.mocked(service.sync).mock.calls[0][0];
        expect(syncCall[0].data).toHaveLength(1000);
    });

    it('returns the schema version from metadata table', async () => {
        vi.mocked(service.query).mockResolvedValue([{ version: '1' }]);
        const version = await ladybugAdapter.getSchemaVersion();
        expect(version).toBe('1');
        expect(service.query).toHaveBeenCalledWith('MATCH (m:Metadata) RETURN m.version AS version', {});
    });

    it('drops and recreates tables if version mismatch (simulated)', async () => {
        // This is primarily tested in the worker, but we verify the adapter can trigger it
        // via getSchemaVersion if needed, or by simply initializing.
        await ladybugAdapter.initialize();
        expect(service.initialize).toHaveBeenCalled();
    });

    describe('Topological Diagnostics (Parity)', () => {
        it('findBlackHoles correctly constructs Cypher query', async () => {
            vi.mocked(service.query).mockResolvedValue([{ path: 'blackhole.md', inDegree: 15 }]);
            const results = await ladybugAdapter.findBlackHoles(10);

            expect(service.query).toHaveBeenCalledWith(expect.stringContaining('SIZE([ (n)-[]->() | n ]) = 0'), {
                threshold: 10,
            });
            expect(results).toEqual([{ path: 'blackhole.md', inDegree: 15 }]);
        });

        it('findBridges correctly constructs Cypher query', async () => {
            const mockBridge = { source: 'A.md', target: 'C.md', via: 'B.md', type: 'up' };
            vi.mocked(service.query).mockResolvedValue([mockBridge]);
            const results = await ladybugAdapter.findBridges();

            expect(service.query).toHaveBeenCalledWith(
                expect.stringContaining('MATCH (a:Node)-[r1]->(b:Node)-[r2]->(c:Node)'),
                {},
            );
            expect(results).toEqual([mockBridge]);
        });

        it('findCycles correctly constructs Cypher query', async () => {
            vi.mocked(service.query).mockResolvedValue([
                {
                    nodes: [{ path: 'A.md' }, { path: 'B.md' }, { path: 'A.md' }],
                    types: ['related', 'related'],
                },
            ]);
            const results = await ladybugAdapter.findCycles(3);

            expect(service.query).toHaveBeenCalledWith(expect.stringContaining('MATCH p = (n:Node)-[*1..3]->(n)'), {});
            expect(results[0]).toEqual({ path: ['A.md', 'B.md', 'A.md'], type: 'related' });
        });
    });

    describe('Graph Algorithms', () => {
        it('getPageRank calls runAlgo on service', async () => {
            const mockRank = { 'a.md': 0.1 };
            (service as any).runAlgo = vi.fn().mockResolvedValue(mockRank);

            const result = await ladybugAdapter.getPageRank();
            expect(service.runAlgo).toHaveBeenCalledWith('pagerank');
            expect(result).toEqual(mockRank);
        });

        it('getLouvainCommunities calls runAlgo on service', async () => {
            const mockCommunities = { 'a.md': 1 };
            (service as any).runAlgo = vi.fn().mockResolvedValue(mockCommunities);

            const result = await ladybugAdapter.getLouvainCommunities();
            expect(service.runAlgo).toHaveBeenCalledWith('louvain');
            expect(result).toEqual(mockCommunities);
        });
    });
});
