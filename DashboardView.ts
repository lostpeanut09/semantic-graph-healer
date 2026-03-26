import { ItemView, WorkspaceLeaf, Notice, DropdownComponent } from 'obsidian';
import { DASHBOARD_VIEW_TYPE, Suggestion, HistoryItem, SuggestionType } from './types';
import { HealerLogger } from './core/HealerUtils';
import SemanticGraphHealer from './main';

export const REASONING_VIEW_TYPE = 'healer-reasoning-view';

const PAGE_SIZE = 30;

/**
 * Dashboard View: Refactored for SOTA 2026 Gold Master.
 * Implements partial re-rendering and paginated scrolling.
 */
export class QuarantineDashboardView extends ItemView {
    plugin: SemanticGraphHealer;
    private filterType = 'all';
    private displayLimit = PAGE_SIZE;

    // Elements to avoid full re-render
    private listContainer: HTMLElement;

    constructor(leaf: WorkspaceLeaf, plugin: SemanticGraphHealer) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return DASHBOARD_VIEW_TYPE;
    }

    getDisplayText() {
        return 'Healer dashboard';
    }

    async onOpen() {
        const { containerEl } = this;
        containerEl.empty();
        this.displayLimit = PAGE_SIZE;
        const mainWrapper = containerEl.createDiv({ cls: 'healer-dashboard-container' });

        // 1. Render Static Frame (Header, Banner)
        this.renderFrame(mainWrapper);

        // 2. Render Dynamic List Container
        this.listContainer = mainWrapper.createDiv({ cls: 'healer-dashboard-list-area' });
        this.renderList();
    }

    /**
     * Renders the static parts of the dashboard (Banner, Title, Filters).
     */
    private renderFrame(container: HTMLElement) {
        // --- BANNER ---
        const bannerPath = this.plugin.app.vault.adapter.getResourcePath(this.plugin.manifest.dir + '/banner.png');
        const bannerEl = container.createEl('img');
        bannerEl.src = bannerPath;
        bannerEl.addClass('healer-dashboard-banner');

        // --- HEADER ROW ---
        const headerRow = container.createDiv({ cls: 'healer-dashboard-header-row' });
        const titleContainer = headerRow.createDiv();
        titleContainer.createEl('h2', { text: 'Semantic health', cls: 'healer-dashboard-header' });
        titleContainer.createEl('p', {
            text: 'Review unresolved topological and structural issues.',
            cls: 'healer-dashboard-desc',
        });

        // --- FILTER DROPDOWN ---
        const filterContainer = headerRow.createDiv({ cls: 'healer-filter-container' });
        const filterSelect = filterContainer.createEl('select', { cls: 'dropdown' });
        const filterOptions = [
            { value: 'all', text: 'All Issues' },
            { value: 'orphan', text: 'Orphan Notes' },
            { value: 'incongruence', text: 'Semantic Conflicts' },
            { value: 'deter_asymmetry', text: 'Missing Reciprocals' },
            { value: 'bridge_gap', text: 'Structural Gaps' },
            { value: 'cycle_ouroboros', text: 'Logic Loops (Ouroboros)' },
            { value: 'sink_stagnation', text: 'Black Holes (Sinks)' },
            { value: 'suggest', text: 'AI Suggestions' },
            { value: 'infra', text: 'Network Gaps' },
        ];
        filterOptions.forEach((opt) => {
            const el = filterSelect.createEl('option', { text: opt.text, value: opt.value });
            if (opt.value === this.filterType) el.selected = true;
        });
        filterSelect.onchange = () => {
            this.filterType = filterSelect.value;
            this.displayLimit = PAGE_SIZE;
            this.renderList(); // Partial update
        };
    }

    /**
     * Renders/Updates only the dynamic suggestion list.
     */
    private renderList() {
        if (!this.listContainer) return;
        this.listContainer.empty();

        try {
            const displaySuggestions = this.getFilteredSuggestions();

            // --- CATEGORY RENDERER ---
            const renderCategory = (category: 'error' | 'suggestion' | 'info', title: string, subtitle: string) => {
                const items = displaySuggestions.filter((s) => (s.category || 'suggestion') === category);
                if (items.length === 0) return;

                const sectionWrapper = this.listContainer.createDiv({ cls: 'healer-dashboard-section' });
                sectionWrapper.addClass(`healer-category-${category}`);

                const secHeader = sectionWrapper.createEl('h3', {
                    text: title,
                    cls: 'healer-section-header',
                });
                if (category === 'error') secHeader.addClass('healer-text-error');

                sectionWrapper.createEl('p', { text: subtitle, cls: 'healer-dashboard-desc' });

                // Paginated rendering
                const visibleItems = items.slice(0, this.displayLimit);

                for (const suggestion of visibleItems) {
                    this.renderSuggestionCard(sectionWrapper, suggestion);
                }

                // "Load more" button
                if (items.length > this.displayLimit) {
                    const loadMore = sectionWrapper.createEl('button', {
                        text: `Show more (${items.length - this.displayLimit} remaining)`,
                        cls: 'healer-btn-load-more',
                    });
                    loadMore.onclick = () => {
                        this.displayLimit += PAGE_SIZE;
                        this.renderList();
                    };
                }
            };

            if (displaySuggestions.length > 0) {
                renderCategory(
                    'error',
                    '⚠️ Errors',
                    'Critical topological inconsistencies that need immediate attention.',
                );
                renderCategory('suggestion', '✨ Suggestions', 'Proposed links and structural improvements.');
                renderCategory('info', 'ℹ️ Info', 'Minor quality observations and architectural notes.');
            } else {
                const emptyState = this.listContainer.createDiv({ cls: 'healer-card' });
                emptyState.createEl('p', {
                    text: this.filterType === 'all' ? 'No issues detected.' : 'No issues match your current filter.',
                });
            }

            // --- HISTORY ---
            this.renderHistory(this.listContainer);
        } catch (e) {
            HealerLogger.error('Failed constructing Dashboard List UI', e);
        }
    }

    // ====================================================================
    //  FILTERING (pure logic)
    // ====================================================================
    private getFilteredSuggestions(): Suggestion[] {
        let results = [...this.plugin.settings.pendingSuggestions];
        if (this.plugin.settings.ignoreOrphanNotes) {
            results = results.filter((s) => s.id.indexOf('orphan') === -1);
        }
        if (this.filterType !== 'all') {
            results = results.filter((s) => {
                switch (this.filterType) {
                    case 'suggest':
                        return s.type === 'ai';
                    case 'orphan':
                        return s.id.startsWith('orphan');
                    case 'bridge_gap':
                        return s.id.startsWith('bridge_gap');
                    case 'cycle_ouroboros':
                        return s.id.startsWith('cycle_');
                    case 'sink_stagnation':
                        return s.id.startsWith('sink_');
                    case 'deter_asymmetry':
                        return (
                            s.id.startsWith('asymmetry') ||
                            (s.type === 'deterministic' &&
                                !s.id.startsWith('tag_sync') &&
                                !s.id.startsWith('bridge_gap'))
                        );
                    default:
                        return s.type === (this.filterType as SuggestionType);
                }
            });
        }
        return results;
    }

    // ====================================================================
    //  SINGLE CARD RENDERER
    // ====================================================================
    private renderSuggestionCard(parent: HTMLElement, suggestion: Suggestion) {
        const category = suggestion.category || 'suggestion';
        const card = parent.createDiv({ cls: `healer-suggestion-card healer-${category}-card` });

        card.createEl('h4', { text: suggestion.link, cls: 'healer-card-title' });
        card.createEl('p', { text: suggestion.source, cls: 'healer-card-p' });

        const confidence = suggestion.meta?.confidence;
        if (confidence) {
            const confDiv = card.createDiv({ cls: 'healer-confidence-text' });
            confDiv.createSpan({ text: `Confidence: ${confidence}%`, cls: 'healer-font-bold' });
        }

        const btnDiv = card.createDiv({ cls: 'healer-btn-container' });

        if (category !== 'info') {
            const btnExec = btnDiv.createEl('button', { text: 'Execute', cls: 'healer-btn-execute' });
            btnExec.onclick = () => {
                if (suggestion.id.startsWith('bridge_gap')) {
                    this.handleExecuteRelink(suggestion).catch((e) => HealerLogger.error('Relink failed', e));
                } else {
                    this.handleExecute(suggestion).catch((e) => HealerLogger.error('Execute failed', e));
                }
            };
        }

        if (suggestion.type === 'incongruence') {
            const btnText = suggestion.reasoning ? 'Re-reason' : 'Check results';
            const btnReason = btnDiv.createEl('button', { text: btnText, cls: 'healer-btn-reason' });
            btnReason.onclick = () => {
                this.handleReasoning(suggestion).catch((e) => HealerLogger.error('Reasoning failed', e));
            };
        }

        if (suggestion.reasoning) {
            this.renderChoiceUI(card, suggestion);
        }

        const btnDismiss = btnDiv.createEl('button', { text: 'Dismiss' });
        btnDismiss.onclick = () => {
            this.plugin.settings.pendingSuggestions = this.plugin.settings.pendingSuggestions.filter(
                (s: Suggestion) => s.id !== suggestion.id,
            );
            void (async () => {
                await this.plugin.saveSettings();
                this.renderList(); // PARTIAL RE-RENDER
            })();
        };

        const btnIgnore = btnDiv.createEl('button', { text: 'Ignore', cls: 'healer-btn-ignore' });
        btnIgnore.onclick = () => {
            if (!this.plugin.settings.proximityIgnoreList.includes(suggestion.link)) {
                this.plugin.settings.proximityIgnoreList.push(suggestion.link);
            }
            this.plugin.settings.pendingSuggestions = this.plugin.settings.pendingSuggestions.filter(
                (s: Suggestion) => s.id !== suggestion.id,
            );
            void (async () => {
                await this.plugin.saveSettings();
                this.renderList(); // PARTIAL RE-RENDER
                new Notice(`${suggestion.link} ignored.`);
            })();
        };
    }

    private renderChoiceUI(card: HTMLElement, suggestion: Suggestion) {
        const values = suggestion.meta?.competingValues ?? suggestion.meta?.losers ?? [];
        if (values.length === 0) return;

        const choiceContainer = card.createDiv({ cls: 'healer-choice-container' });
        const menuContainer = choiceContainer.createDiv({ cls: 'healer-dropdown-container' });
        menuContainer.createSpan({ text: 'Select option: ' });
        const dropdown = new DropdownComponent(menuContainer);
        dropdown.addOption('', 'Choose...');
        values.forEach((v) => {
            dropdown.addOption(v, v);
        });
        dropdown.onChange((val: string) => {
            if (!val) return;
            const losers = values.filter((v) => v !== val);
            this.handleResolveChoice(suggestion, val, losers).catch((e) =>
                HealerLogger.error('Dropdown resolve failed', e),
            );
        });

        const grid = choiceContainer.createDiv({ cls: 'healer-choice-grid' });
        values.forEach((val) => {
            const cleanVal = val.replace(/[[\]]/g, '');
            const isWinner = suggestion.reasoning?.winner?.includes(cleanVal);
            const isRunnerUp = suggestion.reasoning?.runnerUp?.includes(cleanVal);
            const score = isWinner
                ? suggestion.reasoning?.winnerScore
                : isRunnerUp
                  ? suggestion.reasoning?.runnerUpScore
                  : null;

            const item = grid.createDiv({ cls: 'healer-choice-item' });
            const btn = item.createEl('button', { text: val, cls: 'healer-choice-btn' });
            if (isWinner) btn.addClass('is-winner');
            if (isRunnerUp) btn.addClass('is-runner-up');
            if (score) item.createDiv({ text: `${score}%`, cls: 'healer-confidence-meter' });

            btn.onclick = () => {
                const losers = values.filter((v) => v !== val);
                this.handleResolveChoice(suggestion, val, losers).catch((e) =>
                    HealerLogger.error('Button resolve failed', e),
                );
            };
        });

        const whyLink = card.createDiv({ text: 'View AI reasoning log', cls: 'healer-reasoning-link' });
        whyLink.onclick = () => {
            this.showReasoningSidebar(suggestion).catch((e) => HealerLogger.error('Show sidebar failed', e));
        };
    }

    private renderHistory(container: HTMLElement) {
        container.createEl('h3', { text: 'History', cls: 'healer-history-title' });
        const historyList = container.createDiv();
        if (this.plugin.settings.history.length === 0) {
            historyList.createEl('p', { text: 'No actions performed yet.', cls: 'log-muted' });
            return;
        }
        this.plugin.settings.history
            .slice(-5)
            .reverse()
            .forEach((item: HistoryItem) => {
                const row = historyList.createDiv({ cls: 'healer-history-row' });
                const label = row.createSpan();
                const timeStr = new Date(item.timestamp).toLocaleTimeString();
                label.createSpan({ text: `[${timeStr}] `, cls: 'healer-history-timestamp' });
                label.appendText(` ${item.action} ↔ `);
                label.createEl('b', { text: item.file });
                row.createSpan({ text: item.type.toUpperCase(), cls: 'healer-history-badge' });
            });
    }

    private async handleExecute(suggestion: Suggestion) {
        const success = await this.plugin.executor.execute(suggestion);
        if (success) this.renderList();
    }

    private async handleExecuteRelink(suggestion: Suggestion) {
        const success = await this.plugin.executor.executeRelink(suggestion);
        if (success) this.renderList();
    }

    private async handleResolveChoice(suggestion: Suggestion, winner: string, losers: string[]) {
        const success = await this.plugin.executor.resolveChoice(suggestion, winner, losers);
        if (success) this.renderList();
    }

    private async handleReasoning(suggestion: Suggestion) {
        new Notice('Gathering context for AI reasoning...');
        const result = await this.plugin.reasoner.analyze(suggestion);
        if (!result) {
            new Notice('Could not perform reasoning. Check logs.');
            return;
        }
        suggestion.reasoning = result;
        await this.plugin.saveSettings();
        this.renderList();
        new Notice('AI reasoning complete.');
    }

    private async showReasoningSidebar(suggestion: Suggestion) {
        if (!suggestion.reasoning) return;
        let leaf = this.app.workspace.getLeavesOfType(REASONING_VIEW_TYPE)[0];
        if (!leaf) {
            const rightLeaf = this.app.workspace.getRightLeaf(false);
            if (!rightLeaf) return;
            leaf = rightLeaf;
            await leaf.setViewState({ type: REASONING_VIEW_TYPE, active: true });
        }
        const view = leaf.view as ReasoningView;
        await view.setSuggestion(suggestion);
        await this.app.workspace.revealLeaf(leaf);
    }

    async onClose(): Promise<void> {
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
        this.suggestion = suggestion;
        await this.onOpen();
    }
    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('healer-reasoning-pane');
        if (!this.suggestion?.reasoning) {
            contentEl.createEl('p', { text: 'Select an issue to view AI reasoning.' });
            return;
        }
        const { reasoning, link } = this.suggestion;
        contentEl.createEl('h3', { text: `Reasoning: ${link}` });
        const winnerDiv = contentEl.createDiv({ cls: 'healer-reasoning-winner' });
        winnerDiv.createEl('b', { text: 'Verdict: ' });
        winnerDiv.appendText(reasoning.winner || 'Unknown');
        winnerDiv.createSpan({ text: ` (${reasoning.winnerScore}%)`, cls: 'healer-confidence-badge' });
        contentEl.createEl('p', { text: reasoning.winnerWhy });
        contentEl.createEl('hr', { cls: 'healer-hr-subtle' });
        contentEl.createEl('h4', { text: 'Full log' });
        const pre = contentEl.createEl('pre', { cls: 'healer-reasoning-pre' });
        pre.setText(reasoning.rawResponse);
    }
}
