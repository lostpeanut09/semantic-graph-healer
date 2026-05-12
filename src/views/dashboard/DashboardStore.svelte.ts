/* eslint-disable no-undef, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any */
import type { Suggestion, HistoryItem } from '../../types';
import { Notice } from 'obsidian';
import { REASONING_VIEW_TYPE, ReasoningView } from '../DashboardView';
import { ConfirmationModal } from '../components/ConfirmationModal';

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

    async executeComplex(suggestion: Suggestion) {
        const modal = new ConfirmationModal(this.#plugin.app, suggestion, async () => {
            try {
                const success = await this.#plugin.executor.executeRelink(suggestion);
                if (success) {
                    this.#fixedItems.add(suggestion.id);
                    this.refresh();
                }
            } catch (error) {
                console.error(`Failed to execute complex relink for ${suggestion.id}`, error);
            }
        });
        modal.open();
    }

    async undoAction(historyItem: HistoryItem) {
        try {
            const success = await this.#plugin.executor.undo(historyItem);
            if (success) {
                this.refresh();
            }
        } catch (error) {
            console.error('Failed to undo action', error);
        }
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
        this.#suggestions = this.#suggestions.filter((s) => s.id !== suggestion.id);

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

    async showReasoning(suggestion: Suggestion) {
        if (!suggestion.reasoning) return;

        const leaves = this.#plugin.app.workspace.getLeavesOfType(REASONING_VIEW_TYPE);
        let leaf;
        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = this.#plugin.app.workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ type: REASONING_VIEW_TYPE, active: true });
            }
        }

        if (leaf && leaf.view instanceof ReasoningView) {
            await leaf.view.setSuggestion(suggestion);
            this.#plugin.app.workspace.revealLeaf(leaf);
        }
    }

    async analyze(suggestion: Suggestion) {
        const notice = new Notice('Gathering context for AI reasoning...', 0);
        try {
            const result = await this.#plugin.reasoner.analyze(suggestion);
            notice.hide();
            if (result) {
                // Update suggestion in place or replace it
                const index = this.#suggestions.findIndex((s) => s.id === suggestion.id);
                if (index !== -1) {
                    const updated = { ...this.#suggestions[index], reasoning: result };
                    this.#suggestions[index] = updated;
                    this.#plugin.cache.suggestions = [...this.#suggestions];
                    this.#plugin.cache.save();
                    await this.#plugin.saveSettings();

                    // Automatically show reasoning if it was just analyzed
                    await this.showReasoning(updated);
                }
                new Notice('AI reasoning complete.');
            } else {
                new Notice('AI Reasoning failed. Check console.');
            }
        } catch (e) {
            notice.hide();
            console.error(e);
        }
    }

    async verifyAI(suggestion: Suggestion) {
        if (!suggestion.meta) return;

        // Manage transient state by setting a temporary property on the suggestion or using a local state map.
        // For simplicity, we can augment the suggestion object locally for the UI.
        const index = this.#suggestions.findIndex((s) => s.id === suggestion.id);
        if (index === -1) return;

        this.#suggestions[index] = { ...this.#suggestions[index], isVerifying: true };

        try {
            let isValid = false;
            let verificationResult = 'Uncertain';

            if (suggestion.id.startsWith('branch_')) {
                const sourcePath = suggestion.meta.sourcePath || '';
                const targetPaths = suggestion.meta.targetPaths || [];
                const context = await this.#plugin.topology.getContextForAIValidation(sourcePath, targetPaths);

                // Sanitize context for T-10-04 Information Disclosure
                const sanitizedSource = context.sourceContent.replace(/password|secret|key/gi, '***');
                const sanitizedTargets = context.targetContents.map((c: string) =>
                    c.replace(/password|secret|key/gi, '***'),
                );

                isValid = await this.#plugin.llm.validateBranching(
                    suggestion.meta.sourceNote || 'Unknown',
                    suggestion.meta.targetNotes || [],
                    sanitizedSource,
                    sanitizedTargets,
                    context.existingRelations,
                );
                verificationResult = isValid ? 'Valid' : 'Contradiction';
            } else if (suggestion.id.startsWith('tag_')) {
                const childName = suggestion.meta.sourceNote || 'Unknown';
                const tag = suggestion.meta.property || 'Unknown';
                const parentName = suggestion.meta.targetNote || 'Unknown';

                const context = await this.#plugin.topology.getContextForAIValidation(
                    suggestion.meta.sourcePath || '',
                    [suggestion.meta.targetPath || ''],
                );
                const sanitizedChild = context.sourceContent.replace(/password|secret|key/gi, '***');
                const sanitizedParent = context.targetContents[0]?.replace(/password|secret|key/gi, '***');

                isValid = await this.#plugin.llm.validateTagInheritance(
                    childName,
                    tag,
                    parentName,
                    sanitizedChild,
                    sanitizedParent,
                );
                verificationResult = isValid ? 'Valid' : 'Contradiction';
            }

            this.#suggestions[index] = {
                ...this.#suggestions[index],
                isVerifying: false,
                verificationResult,
            };
        } catch (error) {
            console.error('AI Verification failed', error);
            this.#suggestions[index] = {
                ...this.#suggestions[index],
                isVerifying: false,
                verificationResult: 'Error',
            };
        }
    }

    async resolveChoice(suggestion: Suggestion, winner: string, losers: string[]) {
        try {
            const success = await this.#plugin.executor.resolveChoice(suggestion, winner, losers);
            if (success) {
                this.#fixedItems.add(suggestion.id);
                this.refresh();
            }
        } catch (error) {
            console.error(`Failed to resolve choice for ${suggestion.id}`, error);
        }
    }
}
