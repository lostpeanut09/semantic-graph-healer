/* eslint-disable no-undef, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */
import type { Suggestion, HistoryItem } from '../../types';
import { Notice } from 'obsidian';

export class DashboardStore {
    #suggestions = $state<Suggestion[]>([]);
    #history = $state<HistoryItem[]>([]);
    #fixedItems = $state<Set<string>>(new Set());
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
            // Clear fixed items on refresh or keep them? Keep them since they might still be in view
        }
    }

    get suggestions() {
        return this.#suggestions;
    }

    get history() {
        return this.#history;
    }

    get fixedItems() {
        return this.#fixedItems;
    }

    async fixAll(suggestionsToFix: Suggestion[]) {
        let count = 0;
        const total = suggestionsToFix.length;
        
        const notice = new Notice(`Fixing 0/${total}...`, 0);

        for (const s of suggestionsToFix) {
            if (this.#fixedItems.has(s.id)) continue;
            
            try {
                const success = await this.#plugin.executor.execute(s);
                if (success) {
                    this.#fixedItems.add(s.id);
                }
            } catch (error) {
                console.error(`Failed to fix ${s.id}`, error);
            }

            count++;
            notice.setMessage(`Fixing ${count}/${total}...`);

            // Yielding loop: yield every 5 items
            if (count % 5 === 0) {
                await new Promise((r) => setTimeout(r, 0));
            }
        }
        
        notice.hide();
        new Notice(`Batch fix complete: ${count} items processed.`);
    }

    ignore(suggestion: Suggestion) {
        // Remove instantly
        this.#suggestions = this.#suggestions.filter(s => s.id !== suggestion.id);
        
        const frag = new DocumentFragment();
        frag.appendText(`Ignored: ${suggestion.link} `);
        const undoBtn = frag.createEl('button', { text: 'Undo', cls: 'healer-btn-undo' });
        
        let undone = false;
        const notice = new Notice(frag, 5000);
        
        undoBtn.onclick = () => {
            undone = true;
            this.#suggestions = [...this.#suggestions, suggestion];
            notice.hide();
        };

        // If not undone after 5 seconds, persist ignore
        setTimeout(() => {
            if (!undone) {
                if (!this.#plugin.settings.proximityIgnoreList) {
                    this.#plugin.settings.proximityIgnoreList = [];
                }
                this.#plugin.settings.proximityIgnoreList.push(suggestion.link);
                this.#plugin.saveSettings();
            }
        }, 5100);
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
