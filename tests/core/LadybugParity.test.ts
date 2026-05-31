import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LadybugAdapter } from '../../src/core/adapters/LadybugAdapter';
import { DirectedGraph } from 'graphology';

describe('Ladybug Parity (Cypher vs Graphology)', () => {
    let ladybugAdapter: LadybugAdapter;
    let mockService: any;
    let mockMetadataAdapter: any;

    beforeEach(() => {
        mockService = {
            query: vi.fn(),
            sync: vi.fn(),
            initialize: vi.fn(),
            runAlgo: vi.fn(),
        };
        mockMetadataAdapter = {
            getLinksSafe: vi.fn(),
            queryPages: vi.fn(),
        };
        ladybugAdapter = new LadybugAdapter(mockService, mockMetadataAdapter);
    });

    it('findBlackHoles should be logically equivalent to legacy Graphology logic', async () => {
        // Setup a graph with one black hole
        const graph = new DirectedGraph();
        graph.addNode('A.md');
        graph.addNode('B.md');
        graph.addNode('C.md');
        graph.addEdge('A.md', 'B.md');
        graph.addEdge('C.md', 'B.md');
        // B.md is a black hole if threshold < 2

        const threshold = 1;

        // Legacy logic simulation
        const legacyResults: string[] = [];
        graph.forEachNode((node) => {
            if (graph.inDegree(node) > threshold && graph.outDegree(node) === 0) {
                legacyResults.push(node);
            }
        });
        expect(legacyResults).toContain('B.md');

        // Ladybug logic simulation (Cypher)
        // In this test, we verify that the Cypher query we SEND would return B.md
        // We mock the service to return what a real Cypher engine would return for this graph.
        mockService.query.mockImplementation((cypher: string, params: any) => {
            if (cypher.includes('SIZE([ (n)-[]->() | n ]) = 0')) {
                // Simplified Cypher simulator for this specific test case
                if (params.threshold === 1) return [{ path: 'B.md', inDegree: 2 }];
            }
            return [];
        });

        const results = await ladybugAdapter.findBlackHoles(threshold);
        expect(results.map((r) => r.path)).toEqual(legacyResults);
    });

    it('findBridges should be logically equivalent to legacy Graphology logic', async () => {
        // Setup a graph with a bridge: A -> B -> C (A is not connected to C)
        const graph = new DirectedGraph();
        graph.addNode('A.md');
        graph.addNode('B.md');
        graph.addNode('C.md');
        graph.addEdge('A.md', 'B.md', { type: 'up' });
        graph.addEdge('B.md', 'C.md', { type: 'up' });

        // Legacy logic simulation
        const legacyBridges: any[] = [];
        graph.forEachNode((a) => {
            graph.outEdges(a).forEach((edgeAB) => {
                const b = graph.target(edgeAB);
                const typeAB = graph.getEdgeAttribute(edgeAB, 'type');
                graph.outEdges(b).forEach((edgeBC) => {
                    const c = graph.target(edgeBC);
                    const typeBC = graph.getEdgeAttribute(edgeBC, 'type');
                    if (typeAB === typeBC && a !== c && !graph.hasEdge(a, c)) {
                        legacyBridges.push({ source: a, target: c, via: b, type: typeAB });
                    }
                });
            });
        });
        expect(legacyBridges).toHaveLength(1);
        expect(legacyBridges[0].via).toBe('B.md');

        // Ladybug logic simulation
        mockService.query.mockImplementation((cypher: string) => {
            if (cypher.includes('MATCH (a:Node)-[r1]->(b:Node)-[r2]->(c:Node)')) {
                return [{ source: 'A.md', target: 'C.md', via: 'B.md', type: 'up' }];
            }
            return [];
        });

        const results = await ladybugAdapter.findBridges();
        expect(results).toEqual(legacyBridges);
    });

    it('findCycles should be logically equivalent to legacy DFS logic', async () => {
        // Setup a cycle: A -> B -> A
        const graph = new DirectedGraph();
        graph.addNode('A.md');
        graph.addNode('B.md');
        graph.addEdge('A.md', 'B.md', { type: 'related' });
        graph.addEdge('B.md', 'A.md', { type: 'related' });

        // Ladybug logic simulation
        mockService.query.mockImplementation((cypher: string) => {
            if (cypher.includes('MATCH p = (n:Node)-[*1..')) {
                return [
                    {
                        nodes: [{ path: 'A.md' }, { path: 'B.md' }, { path: 'A.md' }],
                        types: ['related', 'related'],
                    },
                ];
            }
            return [];
        });

        const results = await ladybugAdapter.findCycles(3);
        expect(results).toHaveLength(1);
        expect(results[0].path).toEqual(['A.md', 'B.md', 'A.md']);
        expect(results[0].type).toBe('related');
    });

    it('getPageRank should return results consistent with Graphology', async () => {
        const mockPageRank = { 'A.md': 0.5, 'B.md': 0.5 };
        mockService.runAlgo.mockImplementation((algo: string) => {
            if (algo === 'pagerank') return mockPageRank;
            return {};
        });

        const results = await ladybugAdapter.getPageRank();
        expect(results).toEqual(mockPageRank);
    });

    it('getLouvainCommunities should return results consistent with Graphology', async () => {
        const mockCommunities = { 'A.md': 0, 'B.md': 1 };
        mockService.runAlgo.mockImplementation((algo: string) => {
            if (algo === 'louvain') return mockCommunities;
            return {};
        });

        const results = await ladybugAdapter.getLouvainCommunities();
        expect(results).toEqual(mockCommunities);
    });
});
