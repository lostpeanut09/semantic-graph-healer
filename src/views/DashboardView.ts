import { ItemView, WorkspaceLeaf, Notice, Setting } from 'obsidian';
import { DASHBOARD_VIEW_TYPE, Suggestion } from '../types';
import { HealerLogger } from '../core/HealerUtils';
import type SemanticGraphHealer from '../main';
import { mount, unmount } from 'svelte';
import Dashboard from './dashboard/components/Dashboard.svelte';
import { DashboardStore } from './dashboard/DashboardStore.svelte';

export const REASONING_VIEW_TYPE = 'healer-reasoning-view';

export class DashboardView extends ItemView {
    plugin: SemanticGraphHealer;
    componentInstance: any;
    store: DashboardStore;

    constructor(leaf: WorkspaceLeaf, plugin: SemanticGraphHealer) {
        super(leaf);
        this.plugin = plugin;
        this.store = new DashboardStore(this.plugin);
    }

    getViewType() {
        return DASHBOARD_VIEW_TYPE;
    }

    getDisplayText() {
        return 'Healer dashboard';
    }

    async onOpen() {
        this.contentEl.empty();
        this.componentInstance = mount(Dashboard, {
            target: this.contentEl,
            props: {
                store: this.store,
                plugin: this.plugin
            }
        });
    }

    public async refresh() {
        this.store.refresh();
    }

    async onClose() {
        if (this.componentInstance) {
            unmount(this.componentInstance);
            this.componentInstance = null;
        }
        HealerLogger.info('Dashboard view closed.');
    }
}

export class ReasoningView extends ItemView {
    private suggestion: Suggestion | null = null;
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }
    getViewType() {
        return REASONING_VIEW_TYPE;
    }
    getDisplayText() {
        return 'Healer reasoning';
    }
    async setSuggestion(suggestion: Suggestion) {
        await Promise.resolve();
        this.suggestion = suggestion;
        await this.refresh();
    }
    async onOpen() {
        await this.refresh();
    }
    public async refresh() {
        await Promise.resolve();
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('healer-reasoning-pane');
        if (!this.suggestion?.reasoning) {
            contentEl.createEl('p', {
                text: 'Select an issue to view AI reasoning.',
            });
            return;
        }
        const { reasoning, link } = this.suggestion;
        new Setting(contentEl).setName(`Tribunal audit: ${link}`).setHeading();

        const verdict = reasoning.verdict ?? (reasoning.winner ? 'STABLE' : 'UNCERTAIN');
        const confidence = reasoning.confidenceScore ?? reasoning.winnerScore ?? 0;

        const verdictDiv = contentEl.createDiv({
            cls: `healer-verdict-banner healer-verdict-${verdict.toLowerCase()}`,
        });
        verdictDiv.createEl('b', { text: `VERDICT: ${verdict}` });
        verdictDiv.createSpan({
            text: ` (${confidence}%)`,
            cls: 'healer-confidence-badge',
        });

        const primaryArea = contentEl.createDiv({ cls: 'healer-reasoning-section' });
        primaryArea.createEl('h3', { text: 'Primary model reasoning' });
        primaryArea.createEl('p', {
            text: reasoning.primaryReasoning ?? reasoning.winnerWhy ?? '',
            cls: 'healer-reasoning-text',
        });

        if (reasoning.secondaryReasoning) {
            const secondaryDetails = contentEl.createEl('details', {
                cls: 'healer-secondary-reasoning-details',
            });
            secondaryDetails.createEl('summary', { text: 'View secondary model audit' });
            secondaryDetails.createEl('p', {
                text: reasoning.secondaryReasoning,
                cls: 'healer-reasoning-text',
            });
        }

        contentEl.createEl('hr', { cls: 'healer-hr-subtle' });
        new Setting(contentEl).setName('Raw model responses').setHeading();
        const pre = contentEl.createEl('pre', { cls: 'healer-reasoning-pre' });
        pre.setText(reasoning.rawResponse);
    }
}
