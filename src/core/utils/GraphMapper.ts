import type { MultiGraph } from 'graphology';

export interface ForceGraphNode {
    id: string;
    label?: string;
    isCycle?: boolean;
    [key: string]: unknown;
}

export interface ForceGraphLink {
    source: string;
    target: string;
    isGhost?: boolean;
    [key: string]: unknown;
}

export interface ForceGraphData {
    nodes: ForceGraphNode[];
    links: ForceGraphLink[];
}

/**
 * Maps Graphology graph to ForceGraph-compatible format.
 *
 * @param graph - The Graphology MultiGraph instance to map.
 * @returns Data in { nodes, links } format suitable for 3d-force-graph.
 */
export function mapToForceGraph(graph: MultiGraph): ForceGraphData {
    const nodes: ForceGraphNode[] = [];
    const links: ForceGraphLink[] = [];

    // Map Nodes
    graph.forEachNode((node, attributes) => {
        const { isCycle, ...rest } = attributes;
        const nodeData: ForceGraphNode = {
            id: node,
            ...rest,
        };

        // Explicitly map special attributes
        if (isCycle === true) {
            nodeData.isCycle = true;
        }

        nodes.push(nodeData);
    });

    // Map Edges
    graph.forEachEdge((_edge, attributes, source, target) => {
        const { bridge_gap, ...rest } = attributes;
        const linkData: ForceGraphLink = {
            source,
            target,
            ...rest,
        };

        // Explicitly map special attributes
        if (bridge_gap === true) {
            linkData.isGhost = true;
        }

        links.push(linkData);
    });

    return { nodes, links };
}
