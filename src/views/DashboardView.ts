import { ItemView, WorkspaceLeaf, Notice, DropdownComponent, Setting } from 'obsidian';
import { DASHBOARD_VIEW_TYPE, Suggestion, HistoryItem, SuggestionType } from '../types';
import { HealerLogger } from '../core/HealerUtils';
import SemanticGraphHealer from '../main';

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
        await this.refresh();
    }

    public async refresh() {
        await Promise.resolve();
        const { contentEl } = this;
        contentEl.empty();
        this.displayLimit = PAGE_SIZE;
        const mainWrapper = contentEl.createDiv({ cls: 'healer-dashboard-container' });

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
        const manifest = this.plugin.manifest as typeof this.plugin.manifest & { dir?: string };
        const dir = manifest.dir ?? '';
        const bannerPath = this.plugin.app.vault.adapter.getResourcePath(`${dir}/banner.png`);
        const bannerEl = container.createEl('img');
        bannerEl.src = bannerPath;
        bannerEl.addClass('healer-dashboard-banner');

        // --- HEADER ROW ---
        const headerRow = container.createDiv({ cls: 'healer-dashboard-header-row' });
        const titleContainer = headerRow.createDiv();
        new Setting(titleContainer)
            .setName('Semantic health')
            .setHeading()
            .setDesc('Review unresolved topological and structural issues.');
        titleContainer.addClass('healer-dashboard-title-setting'); // Optional: for custom styling

        // --- FILTER DROPDOWN ---
        const filterContainer = headerRow.createDiv({ cls: 'healer-filter-container' });
        const filterSelect = filterContainer.createEl('select', { cls: 'dropdown' });
        const filterOptions = [
            { value: 'all', text: 'All issues' },
            { value: 'orphan', text: 'Orphan notes' },
            { value: 'incongruence', text: 'Semantic conflicts' },
            { value: 'semantic', text: 'Taxonomic inheritance (AI)' },
            { value: 'deter_asymmetry', text: 'Missing reciprocals' },
            { value: 'bridge_gap', text: 'Structural gaps' },
            { value: 'cycle_ouroboros', text: 'Logic loops (Ouroboros)' },
            { value: 'sink_stagnation', text: 'Black holes (Sinks)' },
            { value: 'suggest', text: 'AI suggestions' },
            { value: 'infra', text: 'Network gaps' },
        ];
        filterOptions.forEach((opt) => {
            const el = filterSelect.createEl('option', { text: opt.text, value: opt.value });
            if (opt.value === this.filterType) el.selected = true;
        });
        this.registerDomEvent(filterSelect, 'change', () => {
            this.filterType = filterSelect.value;
            this.displayLimit = PAGE_SIZE;
            this.renderList(); // Partial update
        });
    }

    /**
     * Renders/Updates only the dynamic suggestion list.
     */
    private renderList() {
        if (!this.listContainer) return;

        // UX: Show loading indicator for large vault renders
        this.listContainer.empty();
        const loading = this.listContainer.createDiv({
            cls: 'healer-loading-spinner',
            text: 'Analyzing topological state...',
        });

        try {
            const displaySuggestions = this.getFilteredSuggestions();

            // --- CATEGORY RENDERER ---
            const renderCategory = (category: 'error' | 'suggestion' | 'info', title: string, subtitle: string) => {
                const items = displaySuggestions.filter((s) => (s.category || 'suggestion') === category);
                if (items.length === 0) return;

                const sectionWrapper = this.listContainer.createDiv({ cls: 'healer-dashboard-section' });
                sectionWrapper.addClass(`healer-category-${category}`);

                new Setting(sectionWrapper).setName(title).setHeading().setDesc(subtitle);

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
                    'Errors',
                    'Critical topological inconsistencies that need immediate attention.',
                );
                renderCategory('suggestion', 'Suggestions', 'Proposed links and structural improvements.');
                renderCategory('info', 'Info', 'Minor quality observations and architectural notes.');
            } else {
                const emptyState = this.listContainer.createDiv({ cls: 'healer-card' });
                emptyState.createEl('p', {
                    text: this.filterType === 'all' ? 'No issues detected.' : 'No issues match your current filter.',
                });
            }

            // --- HISTORY ---
            this.renderHistory(this.listContainer);

            // Removal of loading indicator
            loading.remove();
        } catch (e) {
            this.listContainer.empty();
            HealerLogger.error('Failed constructing Dashboard List UI', e);
        }
    }

    // ====================================================================
    //  FILTERING (pure logic)
    // ====================================================================
    private getFilteredSuggestions(): Suggestion[] {
        let results = [...this.plugin.cache.suggestions];
        if (this.plugin.settings.ignoreOrphanNotes) {
            results = results.filter((s) => s.id.indexOf('orphan') === -1);
        }
        if (this.filterType !== 'all') {
            results = results.filter((s) => {
                switch (this.filterType) {
                    case 'suggest':
                        return s.type === 'ai'; // Reverted to original logic, as the change was syntactically incorrect.
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
                                !s.id.startsWith('bridge_gap') &&
                                !s.id.startsWith('orphan') &&
                                !s.id.startsWith('moc_sat') &&
                                !s.id.startsWith('lasso_') &&
                                !s.id.startsWith('cycle_') &&
                                !s.id.startsWith('sink_') &&
                                !s.id.startsWith('dangling') &&
                                !s.id.startsWith('quality'))
                        );
                    case 'incongruence':
                        return s.type === 'incongruence';
                    case 'semantic':
                        return s.type === 'semantic';
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
        if (confidence != null) {
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

        // Phase 3 AI Verification
        const isVerifiableBranching =
            suggestion.type === 'incongruence' &&
            suggestion.category === 'suggestion' &&
            (suggestion.meta?.property === 'next' || suggestion.meta?.property === 'prev');
        const isVerifiableTag = suggestion.type === 'semantic' && suggestion.meta?.property === 'tags';

        if (isVerifiableBranching || isVerifiableTag) {
            const btnAiVerify = btnDiv.createEl('button', {
                text: 'AI verify',
                cls: 'healer-btn-reason', // Use reason class for similar styling
            });

            interface ValidationContext {
                sourceContent: string;
                targetContents: string[];
                existingRelations: string;
            }

            const getContextWithTimeout = async (
                topology: {
                    getContextForAIValidation(source: string, targets: string[]): Promise<ValidationContext>;
                },
                sourcePath: string,
                targetPaths: string[],
                timeoutMs = 10000,
            ): Promise<ValidationContext> => {
                return Promise.race([
                    topology.getContextForAIValidation(sourcePath, targetPaths),
                    new Promise<never>((_, reject) =>
                        setTimeout(() => reject(new Error('Context gathering timeout (10s)')), timeoutMs),
                    ),
                ]);
            };
            interface ValidationTopology {
                getContextForAIValidation(source: string, targets: string[]): Promise<ValidationContext>;
            }
            const topologyInterface = this.plugin.topology as unknown as ValidationTopology;

            btnAiVerify.onclick = async () => {
                btnAiVerify.disabled = true;
                btnAiVerify.setText('Gathering context...');

                try {
                    let isValid = false;

                    if (isVerifiableBranching) {
                        const targetPaths = (suggestion.meta?.competingValues || [])
                            .map((v: string) => {
                                const file = this.app.metadataCache.getFirstLinkpathDest(v, '');
                                return file?.path || '';
                            })
                            .filter((p) => p !== '');

                        let context: ValidationContext = {
                            sourceContent: '',
                            targetContents: [] as string[],
                            existingRelations: '',
                        };
                        if (typeof topologyInterface.getContextForAIValidation === 'function') {
                            context = await getContextWithTimeout(
                                topologyInterface,
                                suggestion.meta?.sourcePath ?? '',
                                targetPaths,
                            );
                        }

                        btnAiVerify.setText('Verifying with AI...');

                        isValid = await this.plugin.llm.validateBranching(
                            suggestion.meta?.sourceNote ?? '',
                            suggestion.meta?.competingValues ?? [],
                            context.sourceContent,
                            context.targetContents,
                            context.existingRelations,
                        );
                    } else if (isVerifiableTag) {
                        let context: ValidationContext = {
                            sourceContent: '',
                            targetContents: [] as string[],
                            existingRelations: '',
                        };
                        if (typeof topologyInterface.getContextForAIValidation === 'function') {
                            context = await getContextWithTimeout(
                                topologyInterface,
                                suggestion.meta?.sourcePath ?? '',
                                [suggestion.meta?.targetPath ?? ''],
                            );
                        }

                        btnAiVerify.setText('Verifying with AI...');

                        isValid = await this.plugin.llm.validateTagInheritance(
                            suggestion.meta?.targetNote ?? '',
                            suggestion.meta?.winner ?? '',
                            suggestion.meta?.sourceNote ?? '',
                            context.targetContents[0],
                            context.sourceContent,
                        );
                    }

                    btnAiVerify.disabled = false;
                    btnAiVerify.setText(isValid ? 'Valid' : 'Contradict');

                    setTimeout(() => {
                        btnAiVerify.setText('AI verify');
                    }, 4000);
                } catch (e) {
                    btnAiVerify.disabled = false;

                    if (e instanceof Error && e.message.includes('timeout')) {
                        new Notice('Context gathering timed out. File may be locked or too large.');
                        btnAiVerify.setText('Timeout');
                        setTimeout(() => btnAiVerify.setText('AI verify'), 3000);
                    } else {
                        btnAiVerify.setText('AI verify');
                        HealerLogger.error('AI Verification failed', e);
                    }
                }
            };
        } else if (suggestion.type === 'incongruence') {
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
            this.plugin.cache.suggestions = this.plugin.cache.suggestions.filter(
                (s: Suggestion) => s.id !== suggestion.id,
            );
            this.plugin.cache.save();
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
            this.plugin.cache.suggestions = this.plugin.cache.suggestions.filter(
                (s: Suggestion) => s.id !== suggestion.id,
            );
            this.plugin.cache.save();
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
            if (score != null) item.createDiv({ text: `${score}%`, cls: 'healer-confidence-meter' });

            btn.onclick = () => {
                const losers = values.filter((v) => v !== val);
                this.handleResolveChoice(suggestion, val, losers).catch((e) =>
                    HealerLogger.error('Button resolve failed', e),
                );
            };
        });

        const whyLink = card.createDiv({ text: 'View Ai reasoning log', cls: 'healer-reasoning-link' });
        whyLink.onclick = () => {
            this.showReasoningSidebar(suggestion).catch((e) => HealerLogger.error('Show sidebar failed', e));
        };
    }

    private renderHistory(container: HTMLElement) {
        new Setting(container).setName('History').setHeading();
        const historyList = container.createDiv();
        const history = this.plugin.cache.history;
        if (history.length === 0) {
            historyList.createEl('p', { text: 'No actions performed yet.', cls: 'log-muted' });
            return;
        }
        history
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
        this.plugin.cache.save();
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
        const view = leaf.view;
        if (view instanceof ReasoningView) {
            await view.setSuggestion(suggestion);
            await this.app.workspace.revealLeaf(leaf);
        }
    }

    async onClose() {
        await Promise.resolve();
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
            contentEl.createEl('p', { text: 'Select an issue to view AI reasoning.' });
            return;
        }
        const { reasoning, link } = this.suggestion;
        new Setting(contentEl).setName(`Reasoning: ${link}`).setHeading();
        const winnerDiv = contentEl.createDiv({ cls: 'healer-reasoning-winner' });
        winnerDiv.createEl('b', { text: 'Verdict: ' });
        winnerDiv.appendText(reasoning.winner || 'Unknown');
        winnerDiv.createSpan({ text: ` (${reasoning.winnerScore ?? 0}%)`, cls: 'healer-confidence-badge' });
        contentEl.createEl('p', { text: reasoning.winnerWhy || '' });
        contentEl.createEl('hr', { cls: 'healer-hr-subtle' });
        new Setting(contentEl).setName('Full log').setHeading();
        const pre = contentEl.createEl('pre', { cls: 'healer-reasoning-pre' });
        pre.setText(reasoning.rawResponse);
    }
}
