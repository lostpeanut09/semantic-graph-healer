import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphVisualizerView, GRAPH_VIEW_TYPE } from '../../src/views/GraphVisualizerView';
import { WorkspaceLeaf } from 'obsidian';
import type SemanticGraphHealer from '../../src/main';

describe('GraphVisualizerView Interaction & Cleanup', () => {
    let mockPlugin: unknown;
    let mockLeaf: unknown;
    let view: GraphVisualizerView;

    beforeEach(() => {
        mockPlugin = {
            settings: { proximityIgnoreList: [] },
            logger: { info: vi.fn(), error: vi.fn() },
            performanceService: {
                isSafetyModeActive: vi.fn().mockReturnValue(false),
            },
            cache: { suggestions: [] },
            executor: { execute: vi.fn() },
        };
        mockLeaf = {
            view: null,
        };
        view = new GraphVisualizerView(mockLeaf as WorkspaceLeaf, mockPlugin as SemanticGraphHealer);
    });

    it('should have correct view type and display text', () => {
        expect(view.getViewType()).toBe(GRAPH_VIEW_TYPE);
        expect(view.getDisplayText()).toBe('Healer graph');
    });

    it('should handle onClose and cleanup resources', async () => {
        const mockDestructor = vi.fn();
        // @ts-ignore - injecting mock graph for testing cleanup
        view['graph'] = { _destructor: mockDestructor };

        await view.onClose();

        expect(mockDestructor).toHaveBeenCalled();
        expect(view['graph']).toBeNull();
    });

    it('should initialize startTime on construction', () => {
        expect(view['startTime']).toBeLessThanOrEqual(Date.now());
    });
});
