import { describe, it, expect } from 'vitest';
import { DirectedGraph } from 'graphology';
import { mapToForceGraph } from '../../../src/core/utils/GraphMapper';

describe('GraphMapper', () => {
  it('should map nodes and edges to ForceGraph format', () => {
    const graph = new DirectedGraph();
    graph.addNode('A', { label: 'Node A' });
    graph.addNode('B', { label: 'Node B' });
    graph.addEdge('A', 'B', { type: 'related' });

    const result = mapToForceGraph(graph);

    expect(result.nodes).toHaveLength(2);
    expect(result.links).toHaveLength(1);

    expect(result.nodes).toContainEqual(expect.objectContaining({ id: 'A', label: 'Node A' }));
    expect(result.nodes).toContainEqual(expect.objectContaining({ id: 'B', label: 'Node B' }));
    expect(result.links[0]).toMatchObject({ source: 'A', target: 'B', type: 'related' });
  });

  it('should detect Ouroboros (cycle) attributes', () => {
    const graph = new DirectedGraph();
    graph.addNode('A', { isCycle: true });
    graph.addNode('B', {});
    graph.addEdge('A', 'B', {});

    const result = mapToForceGraph(graph);

    const nodeA = result.nodes.find(n => n.id === 'A');
    const nodeB = result.nodes.find(n => n.id === 'B');

    expect(nodeA?.isCycle).toBe(true);
    expect(nodeB?.isCycle).toBeUndefined();
  });

  it('should detect Structural Gaps (bridge_gap) and set isGhost', () => {
    const graph = new DirectedGraph();
    graph.addNode('A', {});
    graph.addNode('B', {});
    graph.addEdge('A', 'B', { bridge_gap: true });
    graph.addEdge('B', 'A', { type: 'related' });

    const result = mapToForceGraph(graph);

    const linkAB = result.links.find(l => l.source === 'A' && l.target === 'B');
    const linkBA = result.links.find(l => l.source === 'B' && l.target === 'A');

    expect(linkAB?.isGhost).toBe(true);
    expect(linkBA?.isGhost).toBeFalsy();
  });

  it('should handle MultiGraph if needed (using Graphology abstraction)', () => {
    // ForceGraph format expects source/target as strings (or objects)
    // Graphology.forEachEdge provides source and target.
    const graph = new DirectedGraph();
    graph.addNode('A');
    graph.addNode('B');
    graph.addEdge('A', 'B', { weight: 2 });

    const result = mapToForceGraph(graph);
    expect(result.links[0].weight).toBe(2);
  });
});
