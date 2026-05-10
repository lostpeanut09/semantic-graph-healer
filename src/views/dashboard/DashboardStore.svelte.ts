/* eslint-disable no-undef, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */
import type { Suggestion, HistoryItem } from '../../types';

export class DashboardStore {
    #suggestions = $state<Suggestion[]>([]);
    #history = $state<HistoryItem[]>([]);
    #plugin: any;

    constructor(plugin: any) {
        this.#plugin = plugin;
        this.refresh();

        // Subscribe to real-time events from the plugin context
        this.#plugin.registerEvent(
            this.#plugin.app.workspace.on('semantic-graph:updated', () => {
                this.refresh();
            }),
        );
    }

    refresh() {
        if (this.#plugin.cache) {
            this.#suggestions = [...(this.#plugin.cache.suggestions || [])];
            this.#history = [...(this.#plugin.cache.history || [])];
        }
    }

    get suggestions() {
        return this.#suggestions;
    }

    get history() {
        return this.#history;
    }

    get structuralGaps() {
        return this.#suggestions.filter((s) => s.id.startsWith('bridge_gap'));
    }

    get logicLoops() {
        return this.#suggestions.filter((s) => s.id.startsWith('cycle_'));
    }

    get blackHoles() {
        return this.#suggestions.filter((s) => s.id.startsWith('sink_'));
    }

    get aiSuggestions() {
        return this.#suggestions.filter((s) => s.type === 'ai');
    }
}
