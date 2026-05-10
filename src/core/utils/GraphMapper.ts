import type { MultiGraph } from 'graphology';

export interface ForceGraphNode {
    id: string;
    label?: string;
    isCycle?: boolean;
    [key: string]: any;
}

export interface ForceGraphLink {
    source: string;
    target: string;
    isGhost?: boolean;
    [key: string]: any;
}

export interface ForceGraphData {
    nodes: ForceGraphNode[];
    links: ForceGraphLink[];
}

/**
 * Maps Graphology graph to ForceGraph-compatible format.
 */
export function mapToForceGraph(graph: MultiGraph): ForceGraphData {
    return {
        nodes: [],
        links: [],
    };
}
