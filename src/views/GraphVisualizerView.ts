// @ts-nocheck
import { ItemView, WorkspaceLeaf } from 'obsidian';
import ForceGraph3D from '3d-force-graph';
import type SemanticGraphHealer from '../main';
import { mapToForceGraph } from '../core/utils/GraphMapper';
import { GraphEngine } from '../core/GraphEngine';

export const GRAPH_VIEW_TYPE = 'healer-graph-view';

/**
 * GraphVisualizerView: High-fidelity 3D Graph Visualization.
 * Implements WebGL rendering for 10k+ nodes with topological markers.
 */
export class GraphVisualizerView extends ItemView {
    plugin: SemanticGraphHealer;
    private graph: any = null;
    private startTime: number;
    private animationId: number | null = null;

    constructor(leaf: WorkspaceLeaf, plugin: SemanticGraphHealer) {
        super(leaf);
        this.plugin = plugin;
        this.startTime = Date.now();
    }

    getViewType(): string {
        return GRAPH_VIEW_TYPE;
    }

    getDisplayText(): string {
        return 'Healer graph';
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('healer-graph-view-container');

        const container = contentEl.createDiv({
            cls: 'healer-graph-container',
            attr: { style: 'width: 100%; height: 100%;' },
        });

        // Initialize 3D Force Graph
        this.graph = ForceGraph3D()(container)
            .nodeLabel((n: any) => n.label || n.id)
            .nodeAutoColorBy('group')
            .nodeColor((node: any) => {
                if (node && node.isCycle) {
                    const pulse = Math.sin((Date.now() - this.startTime) / 200) * 0.5 + 0.5;
                    return `rgba(255, 0, 0, ${pulse})`;
                }
                return node?.color || '#1f77b4';
            })
            .linkWidth((link: any) => (link?.isGhost ? 0 : 1))
            .linkDash((link: any) => (link?.isGhost ? [5, 2] : null))
            .linkColor((link: any) => (link?.isGhost ? '#ff9900' : '#ffffff'))
            .onNodeClick((node: any) => {
                this.plugin.logger.info(`Node clicked: ${node?.label || node?.id}`);
                // Future: show popup for fixes
            });

        // Initialize animation loop for pulsing effect on cycle nodes
        this.animate();

        await this.refresh();
    }

    private animate = () => {
        if (!this.graph) return;
        this.graph.nodeColor(this.graph.nodeColor());
        this.animationId = requestAnimationFrame(this.animate);
    };

    /**
     * Rebuilds the graph from current vault state and applies topological decorations.
     */
    async refresh() {
        if (!this.graph) return;

        this.plugin.logger.info('Refreshing graph visualization data...');

        const engine = new GraphEngine({
            app: this.app,
            settings: this.plugin.settings,
            cache: this.plugin.cache,
            graphWorkerService: this.plugin.graphWorkerService,
        });

        // 1. Build the base graph from metadata
        engine.buildGraph();

        // 2. Offload topological analysis to background worker
        const diagnostics = await engine.runTopologicalAnalysis();

        const g = engine.getGraph();

        // 3. Decorate graph with topological markers
        // Mark nodes that are part of a hierarchical cycle
        diagnostics.cycles.forEach((cycle: any) => {
            cycle.path.forEach((nodeId: string) => {
                if (g.hasNode(nodeId)) {
                    g.setNodeAttribute(nodeId, 'isCycle', true);
                }
            });
        });

        // Add ghost edges for structural bridge gaps
        diagnostics.bridges.forEach((bridge: any) => {
            if (g.hasNode(bridge.source) && g.hasNode(bridge.target)) {
                // If the direct edge doesn't exist, we add it as a "ghost" bridge gap
                if (!g.hasEdge(bridge.source, bridge.target)) {
                    g.addEdge(bridge.source, bridge.target, {
                        bridge_gap: true,
                        type: bridge.type,
                    });
                }
            }
        });

        // 4. Map to Force-Graph format and update 3D scene
        const data = mapToForceGraph(g);
        this.graph.graphData(data);

        // Explicit memory cleanup for temporary GraphEngine instance
        engine.dispose();
    }

    async onClose() {
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        if (this.graph) {
            this.plugin.logger.info('Destroying graph visualization and cleaning up WebGL context...');
            if (typeof this.graph._destructor === 'function') {
                this.graph._destructor();
            }
            this.graph = null;
        }
    }
}
