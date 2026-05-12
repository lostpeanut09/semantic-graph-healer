// @ts-nocheck
import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import ForceGraph3D from '3d-force-graph';
import type SemanticGraphHealer from '../main';
import { mapToForceGraph } from '../core/utils/GraphMapper';
import { GraphEngine } from '../core/GraphEngine';
import { GraphPopup } from './components/GraphPopup';

export const GRAPH_VIEW_TYPE = 'healer-graph-view';

/**
 * GraphVisualizerView: High-fidelity 3D Graph Visualization.
 * Implements WebGL rendering for 10k+ nodes with topological markers.
 */
export class GraphVisualizerView extends ItemView {
    plugin: SemanticGraphHealer;
    private graph: unknown = null;
    private startTime: number;
    private animationId: number | null = null;
    private popup: GraphPopup;

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

        // Initialize Popup
        this.popup = new GraphPopup(container, async (suggestion) => {
            this.plugin.logger.info(`Executing fix for: ${suggestion.id}`);
            const success = await this.plugin.executor.execute(suggestion);
            if (success) {
                new Notice('Fix executed successfully.');
                await this.refresh();
            } else {
                new Notice('Fix execution failed.');
            }
        });

        const isSafetyMode = this.plugin.performanceService.isSafetyModeActive();

        // Initialize 3D Force Graph
        this.graph = ForceGraph3D()(container)
            .nodeLabel((n: unknown) => n.label || n.id)
            .nodeAutoColorBy('group')
            .nodeResolution(isSafetyMode ? 1 : 8) // ✅ LOD: Low resolution in Safety Mode
            .nodeColor((node: unknown) => {
                if (node && node.isCycle) {
                    const pulse = Math.sin((Date.now() - this.startTime) / 200) * 0.5 + 0.5;
                    return `rgba(255, 0, 0, ${pulse})`;
                }
                return node?.color || '#1f77b4';
            })
            .linkWidth((link: unknown) => (link?.isGhost ? 0 : (isSafetyMode ? 0.5 : 1))) // ✅ LOD: Thin links in Safety Mode
            .linkDash((link: unknown) => (link?.isGhost ? [5, 2] : null))
            .linkColor((link: unknown) => (link?.isGhost ? '#ff9900' : '#ffffff'))
            .onNodeClick((node: unknown, event: MouseEvent) => {
                this.plugin.logger.info(`Node clicked: ${node?.label || node?.id}`);

                // Find suggestion for this node (priority to errors)
                const suggestions = this.plugin.cache.suggestions.filter(
                    (s) => s.link === node.id || s.meta?.targetPath === node.id || s.meta?.sourcePath === node.id,
                );

                // Sort by severity (error > suggestion > info)
                const severityMap: Record<string, number> = { error: 0, suggestion: 1, info: 2 };
                suggestions.sort((a, b) => (severityMap[a.category] ?? 3) - (severityMap[b.category] ?? 3));

                const rect = container.getBoundingClientRect();
                this.popup.show(
                    event.clientX - rect.left,
                    event.clientY - rect.top,
                    node?.label || node?.id,
                    suggestions[0],
                );
            })
            .onLinkClick((link: unknown, event: MouseEvent) => {
                this.plugin.logger.info(`Link clicked: ${link.source.id} -> ${link.target.id}`);

                // Find suggestion for this link (e.g. topology gaps/bridges)
                const suggestion = this.plugin.cache.suggestions.find(
                    (s) =>
                        (s.meta?.sourcePath === link.source.id && s.meta?.targetPath === link.target.id) ||
                        (s.meta?.sourcePath === link.target.id && s.meta?.targetPath === link.source.id),
                );

                const rect = container.getBoundingClientRect();
                this.popup.show(
                    event.clientX - rect.left,
                    event.clientY - rect.top,
                    `Link: ${link.source.label || link.source.id} → ${link.target.label || link.target.id}`,
                    suggestion,
                );
            });

        // ✅ LOD: Disable hover effects when N > 5000 (Wave 3)
        // Note: graphData isn't loaded yet here, so we apply it in refresh() or check total vault size.
        // For now, if we are in Safety Mode, we can already decide some hover behavior.

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
            performanceService: this.plugin.performanceService,
        });

        // 1. Build the base graph from metadata
        engine.buildGraph();

        // 2. Offload topological analysis to background worker
        const diagnostics = await engine.runTopologicalAnalysis();

        const g = engine.getGraph();

        // 3. Decorate graph with topological markers
        // Mark nodes that are part of a hierarchical cycle
        diagnostics.cycles.forEach((cycle: unknown) => {
            cycle.path.forEach((nodeId: string) => {
                if (g.hasNode(nodeId)) {
                    g.setNodeAttribute(nodeId, 'isCycle', true);
                }
            });
        });

        // Add ghost edges for structural bridge gaps
        diagnostics.bridges.forEach((bridge: unknown) => {
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

        // ✅ LOD (Wave 3): Disable features for high-density graphs
        if (data.nodes.length > 5000 || engine.getGraph().order > 5000) {
            this.plugin.logger.info('High-density graph detected (N > 5000). Disabling hover and labels for performance.');
            this.graph.enablePointerInteraction(false); // Disable hover effects
            this.graph.showNavInfo(false);
        }

        // ✅ WAVE 3: Disable live physics in Safety Mode to preserve CPU
        if (this.plugin.performanceService.isSafetyModeActive()) {
            this.plugin.logger.info('Safety Mode Active: Pausing simulation after initial layout.');
            // Let it warm up for a second then pause
            setTimeout(() => {
                if (this.graph) this.graph.pauseAnimation();
            }, 3000);
        }

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
