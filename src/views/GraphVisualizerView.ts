import { ItemView, WorkspaceLeaf, Notice } from 'obsidian';
import ForceGraph3D from '3d-force-graph';
import type SemanticGraphHealer from '../main';
import { mapToForceGraph } from '../core/utils/GraphMapper';
import { GraphEngine } from '../core/GraphEngine';
import { GraphPopup } from './components/GraphPopup';
import type { ForceGraphNode, ForceGraphLink } from '../types';

export const GRAPH_VIEW_TYPE = 'healer-graph-view';

/**
 * Minimal interface for the subset of the ForceGraph3D chaining API used in this view.
 * Concrete types avoid the structural mismatch between the library's recursive
 * generic ChainableInstance pattern and our narrower ForceGraphNode/ForceGraphLink shapes.
 */
interface ForceGraphInstance {
    nodeLabel(fn: (node: ForceGraphNode) => string): ForceGraphInstance;
    nodeAutoColorBy(attr: string): ForceGraphInstance;
    nodeResolution(res: number): ForceGraphInstance;
    nodeColor(fn: (node: ForceGraphNode) => string): ForceGraphInstance;
    nodeColor(): (node: ForceGraphNode) => string;
    linkWidth(fn: (link: ForceGraphLink) => number): ForceGraphInstance;
    linkWidth(): (link: ForceGraphLink) => number;
    linkDash(fn: (link: ForceGraphLink) => number[] | null): ForceGraphInstance;
    linkColor(fn: (link: ForceGraphLink) => string): ForceGraphInstance;
    onNodeClick(fn: (node: ForceGraphNode, event: MouseEvent) => void): ForceGraphInstance;
    onLinkClick(fn: (link: ForceGraphLink, event: MouseEvent) => void): ForceGraphInstance;
    graphData(data: { nodes: ForceGraphNode[]; links: ForceGraphLink[] }): ForceGraphInstance;
    enablePointerInteraction(enabled: boolean): ForceGraphInstance;
    showNavInfo(enabled: boolean): ForceGraphInstance;
    pauseAnimation(): ForceGraphInstance;
    _destructor?(): void;
}

/**
 * GraphVisualizerView: High-fidelity 3D Graph Visualization.
 * Implements WebGL rendering for 10k+ nodes with topological markers.
 */
export class GraphVisualizerView extends ItemView {
    plugin: SemanticGraphHealer;
    private graph: ForceGraphInstance | null = null;
    private startTime: number;
    private animationId: number | null = null;
    private popup: GraphPopup | null = null;

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

    async onOpen(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('healer-graph-view-container');

        const container = contentEl.createDiv({
            cls: 'healer-graph-container',
            attr: { style: 'width: 100%; height: 100%;' },
        });

        // Initialize Popup
        this.popup = new GraphPopup(container, (suggestion) => {
            void (async () => {
                this.plugin.logger.info(`Executing fix for: ${suggestion.id}`);
                const success = await this.plugin.executor.execute(suggestion);
                if (success) {
                    new Notice('Fix executed successfully.');
                    await this.refresh();
                } else {
                    new Notice('Fix execution failed.');
                }
            })();
        });

        const isSafetyMode = this.plugin.performanceService.isSafetyModeActive();

        // Initialize 3D Force Graph
        // Cast via unknown because the library's chaining return type uses a recursive
        // generic (ChainableInstance) that is structurally incompatible with our narrower
        // ForceGraphInstance interface — the runtime shape is identical.
        this.graph = (ForceGraph3D as unknown as (el: HTMLElement) => ForceGraphInstance)(container)
            .nodeLabel((node: ForceGraphNode) => {
                return node.label || node.id;
            })
            .nodeAutoColorBy('group')
            .nodeResolution(isSafetyMode ? 1 : 8)
            .nodeColor((node: ForceGraphNode) => {
                if (node && node.isCycle) {
                    const pulse = Math.sin((Date.now() - this.startTime) / 200) * 0.5 + 0.5;
                    return `rgba(255, 0, 0, ${pulse})`;
                }
                return node?.color || '#1f77b4';
            })
            .linkWidth((link: ForceGraphLink) => {
                return link?.isGhost ? 0 : isSafetyMode ? 0.5 : 1;
            })
            .linkDash((link: ForceGraphLink) => {
                return link?.isGhost ? [5, 2] : null;
            })
            .linkColor((link: ForceGraphLink) => {
                return link?.isGhost ? '#ff9900' : '#ffffff';
            })
            .onNodeClick((node: ForceGraphNode, event: MouseEvent) => {
                this.plugin.logger.info(`Node clicked: ${node?.label || node?.id}`);

                // Find suggestion for this node (priority to errors)
                const suggestions = this.plugin.cache.suggestions.filter(
                    (s) => s.link === node.id || s.meta?.targetPath === node.id || s.meta?.sourcePath === node.id,
                );

                // Sort by severity (error > suggestion > info)
                const severityMap: Record<string, number> = {
                    error: 0,
                    suggestion: 1,
                    info: 2,
                };
                suggestions.sort((a, b) => (severityMap[a.category] ?? 3) - (severityMap[b.category] ?? 3));

                const rect = container.getBoundingClientRect();
                if (this.popup) {
                    this.popup.show(
                        event.clientX - rect.left,
                        event.clientY - rect.top,
                        node?.label || node?.id,
                        suggestions[0],
                    );
                }
            })
            .onLinkClick((link: ForceGraphLink, event: MouseEvent) => {
                // After ForceGraph3D layout, link.source/target are always node objects
                const linkSourceNode = typeof link.source === 'object' ? link.source : null;
                const linkTargetNode = typeof link.target === 'object' ? link.target : null;
                const sourceId = linkSourceNode?.id ?? (typeof link.source === 'string' ? link.source : '');
                const targetId = linkTargetNode?.id ?? (typeof link.target === 'string' ? link.target : '');
                this.plugin.logger.info(`Link clicked: ${sourceId} -> ${targetId}`);

                // Find suggestion for this link (e.g. topology gaps/bridges)
                const suggestion = this.plugin.cache.suggestions.find(
                    (s) =>
                        (s.meta?.sourcePath === sourceId && s.meta?.targetPath === targetId) ||
                        (s.meta?.sourcePath === targetId && s.meta?.targetPath === sourceId),
                );

                const rect = container.getBoundingClientRect();
                if (this.popup) {
                    this.popup.show(
                        event.clientX - rect.left,
                        event.clientY - rect.top,
                        `Link: ${linkSourceNode?.label || sourceId} → ${linkTargetNode?.label || targetId}`,
                        suggestion,
                    );
                }
            });

        // Initialize animation loop for pulsing effect on cycle nodes
        this.animate();

        await this.refresh();
    }

    private animate = () => {
        if (!this.graph) return;
        // Re-apply color function to update pulsing cycle colors
        const colorAccessor = this.graph.nodeColor();
        if (typeof colorAccessor === 'function') {
            this.graph.nodeColor(colorAccessor);
        }
        this.animationId = requestAnimationFrame(this.animate);
    };

    /**
     * Rebuilds the graph from current vault state and applies topological decorations.
     */
    async refresh(): Promise<void> {
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
        diagnostics.cycles.forEach((cycle) => {
            cycle.path.forEach((nodeId: string) => {
                if (g.hasNode(nodeId)) {
                    g.setNodeAttribute(nodeId, 'isCycle', true);
                }
            });
        });

        // Add ghost edges for structural bridge gaps
        diagnostics.bridges.forEach((bridge) => {
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
            this.plugin.logger.info(
                'High-density graph detected (N > 5000). Disabling hover and labels for performance.',
            );
            this.graph.enablePointerInteraction(false);
            this.graph.showNavInfo(false);
        }

        // ✅ WAVE 3: Disable live physics in Safety Mode to preserve CPU
        if (this.plugin.performanceService.isSafetyModeActive()) {
            this.plugin.logger.info('Safety Mode Active: Pausing simulation after initial layout.');
            setTimeout(() => {
                if (this.graph) this.graph.pauseAnimation();
            }, 3000);
        }

        // Explicit memory cleanup for temporary GraphEngine instance
        engine.dispose();
    }

    onClose(): Promise<void> {
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
        return Promise.resolve();
    }
}
