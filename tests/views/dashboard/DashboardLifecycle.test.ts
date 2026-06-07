import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardView } from '../../../src/views/DashboardView';
import { mount, unmount } from 'svelte';
import type { WorkspaceLeaf } from 'obsidian';
import type SemanticGraphHealer from '../../../src/main';

// Mock Svelte mount/unmount
vi.mock('svelte', () => ({
    mount: vi.fn().mockReturnValue({}),
    unmount: vi.fn(),
}));

describe('DashboardView Lifecycle', () => {
    let mockLeaf: unknown;
    let mockPlugin: unknown;

    beforeEach(() => {
        mockLeaf = {
            view: {},
        };
        mockPlugin = {
            app: {
                workspace: {
                    on: vi.fn().mockReturnValue({}),
                },
            },
            registerEvent: vi.fn(),
            cache: {
                suggestions: [],
                history: [],
            },
        };
        vi.clearAllMocks();
    });

    it('mounts the Svelte component onOpen', async () => {
        const view = new DashboardView(
            mockLeaf as unknown as WorkspaceLeaf,
            mockPlugin as unknown as SemanticGraphHealer,
        );

        await view.onOpen();

        expect(mount).toHaveBeenCalled();
        expect(view.componentInstance).toBeDefined();
    });

    it('unmounts the Svelte component onClose', async () => {
        const view = new DashboardView(
            mockLeaf as unknown as WorkspaceLeaf,
            mockPlugin as unknown as SemanticGraphHealer,
        );
        await view.onOpen();

        const instance = view.componentInstance;
        await view.onClose();

        expect(unmount).toHaveBeenCalledWith(instance);
        expect(view.componentInstance).toBeNull();
    });

    it('refresh calls store.refresh', async () => {
        const view = new DashboardView(
            mockLeaf as unknown as WorkspaceLeaf,
            mockPlugin as unknown as SemanticGraphHealer,
        );
        const refreshSpy = vi.spyOn(view.store, 'refresh');

        await view.refresh();

        expect(refreshSpy).toHaveBeenCalled();
    });
});
