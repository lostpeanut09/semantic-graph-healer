import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardStore } from '../../../src/views/dashboard/DashboardStore.svelte';
import type { Suggestion, HistoryItem } from '../../../src/types';

describe('DashboardStore', () => {
    let mockPlugin: any;
    let mockWorkspace: any;
    let eventCallback: Function | null;

    beforeEach(() => {
        eventCallback = null;

        mockWorkspace = {
            on: vi.fn((event: string, cb: Function) => {
                if (event === 'semantic-graph:updated') {
                    eventCallback = cb;
                }
                return { event, cb };
            }),
        };

        mockPlugin = {
            app: {
                workspace: mockWorkspace,
            },
            registerEvent: vi.fn(),
            cache: {
                suggestions: [] as Suggestion[],
                history: [] as HistoryItem[],
            },
        };
    });

    it('initializes with suggestions and history from cache', () => {
        const mockSuggestions: Suggestion[] = [
            { id: 'bridge_gap_1', type: 'topology_gap', category: 'suggestion', link: '', source: '', timestamp: 0 },
            { id: 'cycle_1', type: 'deterministic', category: 'error', link: '', source: '', timestamp: 0 },
        ];
        mockPlugin.cache.suggestions = mockSuggestions;

        const store = new DashboardStore(mockPlugin);

        expect(store.suggestions.length).toBe(2);
        expect(store.structuralGaps.length).toBe(1);
        expect(store.logicLoops.length).toBe(1);
    });

    it('filters correctly using derived getters', () => {
        const mockSuggestions: Suggestion[] = [
            { id: 'bridge_gap_1', type: 'topology_gap', category: 'suggestion', link: '', source: '', timestamp: 0 },
            { id: 'cycle_1', type: 'deterministic', category: 'error', link: '', source: '', timestamp: 0 },
            { id: 'sink_1', type: 'quality', category: 'info', link: '', source: '', timestamp: 0 },
            { id: 'other_1', type: 'ai', category: 'suggestion', link: '', source: '', timestamp: 0 },
        ];
        mockPlugin.cache.suggestions = mockSuggestions;

        const store = new DashboardStore(mockPlugin);

        expect(store.structuralGaps.map((s) => s.id)).toEqual(['bridge_gap_1']);
        expect(store.logicLoops.map((s) => s.id)).toEqual(['cycle_1']);
        expect(store.blackHoles.map((s) => s.id)).toEqual(['sink_1']);
        expect(store.aiSuggestions.map((s) => s.id)).toEqual(['other_1']);
    });

    it('updates reactivity when refresh is called', () => {
        const store = new DashboardStore(mockPlugin);
        expect(store.suggestions.length).toBe(0);

        mockPlugin.cache.suggestions = [
            { id: 'bridge_gap_1', type: 'topology_gap', category: 'suggestion', link: '', source: '', timestamp: 0 },
        ];

        store.refresh();

        expect(store.suggestions.length).toBe(1);
        expect(store.structuralGaps.length).toBe(1);
    });

    it('automatically refreshes when event is triggered', () => {
        const store = new DashboardStore(mockPlugin);
        expect(store.suggestions.length).toBe(0);

        mockPlugin.cache.suggestions = [
            { id: 'sink_1', type: 'quality', category: 'info', link: '', source: '', timestamp: 0 },
        ];

        // Trigger the registered event
        expect(eventCallback).not.toBeNull();
        if (eventCallback) {
            eventCallback();
        }

        expect(store.suggestions.length).toBe(1);
        expect(store.blackHoles.length).toBe(1);
    });
});
