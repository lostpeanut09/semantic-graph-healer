import { Plugin, Notice, WorkspaceLeaf, requestUrl, TFile } from 'obsidian';
import {
    DASHBOARD_VIEW_TYPE,
    SemanticGraphHealerSettings,
    DEFAULT_SETTINGS,
    Suggestion,
    HistoryItem,
    SuggestionType,
    InfraGap,
    ExtendedApp,
} from './types';
import {
    formatRagPrompt,
    generateId,
    sleep,
    isThenable,
    isObsidianInternalApp,
    HealerLogger as LegacyLogger,
} from './core/HealerUtils';
import { HealerLogger as InstanceLogger } from './core/utils/HealerLogger';
import { KeychainService } from './core/services/KeychainService';
import { GraphWorkerService } from './core/services/GraphWorkerService';
import type { AnalysisContext, ExecutionContext } from './core/services/PluginContext';
import { TopologyAnalyzer } from './core/TopologyAnalyzer';
import { QualityAnalyzer } from './core/QualityAnalyzer';
import { LlmService } from './core/LlmService';
import { UnifiedMetadataAdapter } from './core/adapters/UnifiedMetadataAdapter';
import { SuggestionExecutor } from './core/SuggestionExecutor';
import { ReasoningService } from './core/ReasoningService';
import { QuarantineDashboardView, ReasoningView, REASONING_VIEW_TYPE } from './views/DashboardView';
import { SemanticHealerSettingTab } from './views/SettingsTab';
import { CacheService } from './core/CacheService';
import { SemanticTagPropagator } from './core/SemanticTagPropagator';

export default class SemanticGraphHealer extends Plugin {
    settings: SemanticGraphHealerSettings;

    public topology: TopologyAnalyzer;
    public quality: QualityAnalyzer;
    public llm: LlmService;
    public engine: UnifiedMetadataAdapter;
    public executor: SuggestionExecutor;
    public reasoner: ReasoningService;
    public tagPropagator: SemanticTagPropagator;

    // Phase 1 Services
    public logger: InstanceLogger;
    public keychainService: KeychainService;
    public graphWorkerService: GraphWorkerService;
    public cache: CacheService;

    private isAnalyzing = false;
    private analysisDebounce = new Map<string, ReturnType<typeof setTimeout>>();
    private currentAnalysisController: AbortController | null = null;

    async onload() {
        this.cache = new CacheService(this);
        await this.loadSettings();

        // 1. Initialize Infrastructure & Services
        this.logger = new InstanceLogger('SemanticGraphHealer', this, this.settings);
        LegacyLogger.setInstance(this.logger);
        this.logger.info('Semantic Graph Healer Phase 4 loading...');

        this.keychainService = new KeychainService({
            app: this.app,
            settings: this.settings,
            saveSettings: () => this.saveSettings(),
        });
        this.graphWorkerService = new GraphWorkerService(this.logger, this);
        await this.graphWorkerService.initialize();

        this.engine = new UnifiedMetadataAdapter(this.app as ExtendedApp, this.settings);
        // Build execution context for SuggestionExecutor (break circular dep)
        const executorContext: ExecutionContext = {
            app: this.app,
            settings: this.settings,
            cache: this.cache,
            manifest: this.manifest,
            graphWorkerService: this.graphWorkerService,
            saveSettings: () => this.saveSettings(),
            refreshDashboard: () => this.refreshDashboard(),
        };
        this.executor = new SuggestionExecutor(executorContext);
        this.llm = new LlmService(this.settings, (type) => this.getApiKey(type));
        // Build analysis context for TopologyAnalyzer (break circular dep)
        const analysisContext: AnalysisContext = {
            app: this.app,
            settings: this.settings,
            cache: this.cache,
            graphWorkerService: this.graphWorkerService,
        };
        this.topology = new TopologyAnalyzer(analysisContext, this.llm, this.engine);
        this.quality = new QualityAnalyzer(this.app as ExtendedApp, this.settings, this.engine);
        this.reasoner = new ReasoningService(
            this.app as ExtendedApp,
            this.settings,
            this.llm,
            this.engine.getDataviewApi(),
        );
        this.tagPropagator = new SemanticTagPropagator(this.app as ExtendedApp, this.settings, this.engine, this.llm);

        // 2. Setup Security & Identity
        await this.initializeSecurity();

        // 3. Register Framework Extensions
        this.registerProtocolHandlers();
        this.registerViews();
        this.registerCommands();
        this.registerUI();

        // 4. Register Event Hooks for real-time healing
        this.registerVaultEvents();

        this.app.workspace.onLayoutReady(() => {
            this.verifyDependencies();
        });

        this.addSettingTab(new SemanticHealerSettingTab(this.app, this));
        this.logger.info('Semantic Graph Healer Phase 4 ready');
    }

    /**
     * Sharing & Sync Integrity: React to external data.json changes (e.g. Obsidian Sync).
     * SOTA 2026 Resilience: Full hot-reload of all analytical dependencies.
     */
    async onExternalSettingsChange() {
        try {
            this.logger.info('External settings change detected. Re-initializing engine...');
            await this.loadSettings();

            // 1. Hot Reload Infrastructure
            if (this.engine) {
                this.engine.destroy();
            }
            this.engine = new UnifiedMetadataAdapter(this.app as ExtendedApp, this.settings);

            // 2. Hot Reload Logic Services
            this.llm = new LlmService(this.settings, (type) => this.getApiKey(type));
            this.quality = new QualityAnalyzer(this.app as ExtendedApp, this.settings, this.engine);
            // Build analysis context for TopologyAnalyzer (break circular dep)
            const analysisContext: AnalysisContext = {
                app: this.app,
                settings: this.settings,
                cache: this.cache,
                graphWorkerService: this.graphWorkerService,
            };
            this.topology = new TopologyAnalyzer(analysisContext, this.llm, this.engine);

            // 4. Hot Reload Worker Service (P2 Fix)
            if (this.graphWorkerService) {
                this.graphWorkerService.destroy();
            }
            this.graphWorkerService = new GraphWorkerService(this.logger, this);
            await this.graphWorkerService.initialize();

            // 3. Hot Reload Executor (break circular dep)
            const executorContext: ExecutionContext = {
                app: this.app,
                settings: this.settings,
                cache: this.cache,
                manifest: this.manifest,
                graphWorkerService: this.graphWorkerService,
                saveSettings: () => this.saveSettings(),
                refreshDashboard: () => this.refreshDashboard(),
            };
            this.executor = new SuggestionExecutor(executorContext);

            new Notice('Settings synchronized successfully.');
            this.logger.info('Hot reload complete. UI refresh triggered.');
            void this.refreshDashboard().catch((e) => this.logger.error('Sync Refresh failed', e));
        } catch (e) {
            this.logger.error('Failed to handle external settings change', e);
        }
    }

    private registerVaultEvents() {
        const triggerAnalysis = (file: TFile, force = false) => {
            // Check if user is currently viewing/editing this file
            const activeFile = this.app.workspace.getActiveFile();
            if (!force && activeFile && activeFile.path === file.path) {
                this.logger.info(`Skipping analysis for active file: ${file.basename}. Will retry on focus change.`);
                return;
            }

            if (this.analysisDebounce.has(file.path)) {
                clearTimeout(this.analysisDebounce.get(file.path));
            }

            const timer = setTimeout(() => {
                if (this.isAnalyzing) return;
                void this.analyzeFileContext(file);
                this.analysisDebounce.delete(file.path);
            }, 5000);

            this.analysisDebounce.set(file.path, timer);
        };

        // 1. Creation Event
        this.registerEvent(
            this.app.vault.on('create', (file) => {
                void (async () => {
                    if (!(file instanceof TFile)) return;
                    const isMd = file.extension === 'md';
                    const isCanvas = file.extension === 'canvas' && this.settings.includeNonMarkdownHubs;

                    if (!isMd && !isCanvas) return;

                    await sleep(500);
                    await this.analyzeFileContext(file);
                })();
            }),
        );

        // 2. Modification Event (Only for background files)
        this.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                if (!(file instanceof TFile)) return;

                // CRUCIAL: Invalidate the adjacency index when metadata changes
                this.engine.invalidateBacklinkIndex();

                const isMd = file.extension === 'md';
                const isCanvas = file.extension === 'canvas' && this.settings.includeNonMarkdownHubs;

                if (isMd || isCanvas) {
                    triggerAnalysis(file); // Re-enabled with 5s debounce for 2026 Audit
                }
            }),
        );

        // 4. Cleanup/Refactoring integrity events
        this.registerEvent(
            this.app.vault.on('rename', () => {
                this.engine.invalidateBacklinkIndex();
            }),
        );
        this.registerEvent(
            this.app.vault.on('delete', () => {
                this.engine.invalidateBacklinkIndex();
            }),
        );

        // 3. Focus Change Event (Trigger analysis on the file we just left)
        let lastFile: TFile | null = null;
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                const currentFile = this.app.workspace.getActiveFile();
                if (lastFile && (!currentFile || lastFile.path !== currentFile.path)) {
                    this.logger.info(`Context switched from: ${lastFile.basename}. Triggering deferred analysis...`);
                    triggerAnalysis(lastFile, true);
                }
                lastFile = currentFile;
            }),
        );
    }

    private async analyzeFileContext(file: TFile) {
        if (this.isAnalyzing) return;
        this.isAnalyzing = true;
        try {
            const bridgeIssues = await this.topology.runBridgeScrutiny(file);
            if (bridgeIssues.length > 0) {
                // FIX: Deduplication using Stable ID (ID deterministico strutturale)
                const newIssues = bridgeIssues.filter(
                    (bi: Suggestion) => !this.cache.suggestions.some((ps: Suggestion) => ps.id === bi.id),
                );

                if (newIssues.length > 0) {
                    this.cache.suggestions.push(...newIssues);
                    this.cache.save();
                    new Notice(`Structural gap detected for ${file.basename}!`);
                    await this.saveSettings();
                    void this.refreshDashboard();
                }
            }
        } catch (e) {
            this.logger.error('Bridge audit failed', e);
        } finally {
            this.isAnalyzing = false;
        }
    }

    private async initializeSecurity() {
        // Cloud Safety Net (Used only if detection is never run)
        // Cloud Safety Net (SOTA 2026 standard models)
        const cloudFallbacks = this.settings.cloudModelFallbacks;

        let settingsChanged = false;
        // Option B Logic: Only populate if completely empty (first run)
        if (!this.settings.detectedModels || this.settings.detectedModels.length === 0) {
            this.settings.detectedModels = [...cloudFallbacks];
            settingsChanged = true;
        }
        if (!this.settings.secondaryDetectedModels || this.settings.secondaryDetectedModels.length === 0) {
            this.settings.secondaryDetectedModels = [...cloudFallbacks];
            settingsChanged = true;
        }

        const app = this.app as ExtendedApp;
        if (app.secretStorage || app.keychain) {
            this.logger.debug('Obsidian secure storage detected. Verifying and migrating API keys...');

            // 1. Migrate Primary Key
            if (this.settings.llmApiKey && this.settings.llmApiKey !== 'sk-local') {
                await this.keychainService.setApiKey('openai', this.settings.llmApiKey);
                this.settings.llmApiKey = '';
                settingsChanged = true;
            }
            // Fallback for previous manual naming 'semantic-healer-primary'
            const keychain = app.keychain;
            const secretStorage = app.secretStorage;

            let legacyKey: string | null = null;

            if (secretStorage) {
                const res = secretStorage.getSecret('semantic-healer-primary');
                legacyKey = await Promise.resolve(res);
            } else if (keychain) {
                const res = keychain.get('semantic-healer-primary');
                legacyKey = await Promise.resolve(res);
            }

            if (legacyKey) {
                await this.keychainService.setApiKey('openai', legacyKey);
                // Clean up legacy key
                if (secretStorage) {
                    const res = secretStorage.setSecret('semantic-healer-primary', '');
                    if (isThenable(res)) await res;
                } else if (keychain) {
                    const res = keychain.set('semantic-healer-primary', '');
                    if (isThenable(res)) await res;
                }
            }

            // 2. Migrate Secondary Key
            if (this.settings.secondaryLlmApiKey) {
                await this.keychainService.setApiKey('anthropic', this.settings.secondaryLlmApiKey);
                this.settings.secondaryLlmApiKey = '';
                settingsChanged = true;
            }

            // 3. Migrate InfraNodus Key
            if (this.settings.infraNodusApiKey) {
                await this.keychainService.setApiKey('infranodus', this.settings.infraNodusApiKey);
                this.settings.infraNodusApiKey = '';
                settingsChanged = true;
            }
        }
        if (settingsChanged) await this.saveSettings();
    }

    private registerProtocolHandlers() {
        this.registerObsidianProtocolHandler('healer', async (params) => {
            if (params.action === 'scan') {
                new Notice('Remote scan triggered.');
                await this.analyzeGraph();
            }
        });
    }

    private registerViews() {
        this.registerView(DASHBOARD_VIEW_TYPE, (leaf) => new QuarantineDashboardView(leaf, this));
        this.registerView(REASONING_VIEW_TYPE, (leaf) => new ReasoningView(leaf));
    }

    private registerUI() {
        this.addRibbonIcon('network', 'Analyze graph', async () => {
            await this.analyzeGraph();
        });
    }

    private registerCommands() {
        this.addCommand({
            id: 'open-graph-healer-dashboard',
            name: 'Open dashboard',
            callback: async () => {
                try {
                    await this.activateDashboard();
                } catch (e) {
                    this.logger.error('Failed to open Graph Healer Dashboard', e);
                    new Notice('Error opening the dashboard.');
                }
            },
        });

        // SOTA 2026: CLI-optimized command for automation
        this.addCommand({
            id: 'analyze-silent',
            name: 'Run silent graph analysis (CLI)',
            callback: async () => {
                this.logger.info('CLI: Silent analysis triggered.');
                await this.analyzeGraph(true); // silent = true
            },
        });

        this.addCommand({
            id: 'discover-semantic-proximity',
            name: 'Discover proximity',
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile) {
                    new Notice('Open a file to run semantic proximity discovery.');
                    return;
                }
                if (this.settings.fullyScannedNotes.includes(activeFile.path)) {
                    new Notice('Note already scanned.');
                    return;
                }

                try {
                    const content = await this.app.vault.read(activeFile);
                    const cache = this.app.metadataCache.getFileCache(activeFile);
                    const tags = cache?.tags?.map((t) => t.tag).join(', ') || 'None';
                    const frontmatterLength = cache?.frontmatter ? Object.keys(cache.frontmatter).length : 0;
                    const ragPrompt = formatRagPrompt(
                        activeFile.basename,
                        tags,
                        frontmatterLength,
                        content.substring(0, 500),
                    );

                    new Notice(`Running semantic discovery...`);
                    const suggestion = await this.llm.callLlm(ragPrompt, this.settings.enableAiTribunal);

                    if (this.settings.enableSmartConnections) {
                        const scSuggestions = await this.quality.querySmartConnections(
                            activeFile.basename,
                            this.settings.smartConnectionsLimit,
                        );
                        if (scSuggestions.length > 0) {
                            this.cache.suggestions.push(...scSuggestions);
                            this.cache.save();
                        }
                    }

                    if (suggestion && !suggestion.startsWith('ERROR') && !suggestion.startsWith('CONFLICT')) {
                        const linkRegex = /\[\[(.*?)\]\]/g;
                        let match;
                        let foundAny = false;
                        while ((match = linkRegex.exec(suggestion)) !== null) {
                            const link = match[0];
                            const targetName = match[1];
                            if (!this.settings.proximityIgnoreList.includes(link)) {
                                this.cache.suggestions.push({
                                    id: generateId('ai'),
                                    type: 'ai',
                                    link: link,
                                    source: activeFile.path,
                                    timestamp: Date.now(),
                                    category: 'suggestion',
                                    meta: {
                                        sourcePath: activeFile.path,
                                        sourceNote: activeFile.basename,
                                        targetNote: targetName,
                                        description: 'AI Suggested Proximity',
                                    },
                                });
                                foundAny = true;
                            }
                        }
                        if (foundAny) {
                            this.cache.save();
                            await this.saveSettings();
                            new Notice('New links suggested.');
                            void this.refreshDashboard();
                        }
                    }
                } catch (e) {
                    this.logger.error('Proximity Error', e);
                }
            },
        });

        this.addCommand({
            id: 'align-mocs-via-tags',
            name: 'Sync topologies via tags',
            callback: async () => {
                const activeFile = this.app.workspace.getActiveFile();
                if (!activeFile || !this.settings.enableTagHierarchySync) return;
                try {
                    const cache = this.app.metadataCache.getFileCache(activeFile);
                    const tags = cache?.tags?.map((t) => t.tag) || [];

                    // 1. Parent suggestions (per-file)
                    const parentSuggestions = this.topology.deriveTagSuggestions(tags, activeFile.path);

                    // 2. Sibling suggestions (vault-wide, filtered to active file)
                    const allSiblings = this.topology.deriveTagSiblings();
                    const relevantSiblings = allSiblings.filter(
                        (s: Suggestion) =>
                            s.meta?.sourceNote === activeFile.basename || s.meta?.targetNote === activeFile.basename,
                    );

                    const combined = [...parentSuggestions, ...relevantSiblings];

                    if (combined.length > 0) {
                        // Deduplicate against existing
                        const newOnes = combined.filter(
                            (s: Suggestion) => !this.cache.suggestions.some((p: Suggestion) => p.id === s.id),
                        );
                        if (newOnes.length > 0) {
                            this.cache.suggestions.push(...newOnes);
                            this.cache.save();
                            await this.saveSettings();
                            void this.refreshDashboard();
                            new Notice(`Derived ${newOnes.length} mapping(s).`);
                        } else {
                            new Notice('All tag relationships already tracked.');
                        }
                    } else {
                        new Notice('No tag-based relationships found.');
                    }
                } catch (e) {
                    this.logger.error('Tag Sync Error', e);
                }
            },
        });

        this.addCommand({
            id: 'build-lasso-hierarchy',
            name: 'Build lasso hierarchy (recent notes)',
            callback: async () => {
                const recentPaths = this.app.workspace.getLastOpenFiles();

                // Filter to only valid markdown files
                const recentFilesArr = recentPaths
                    .map((p: string) => this.app.vault.getAbstractFileByPath(p))
                    .filter((f): f is TFile => f instanceof TFile && f.extension === 'md')
                    .slice(0, 10); // Cap at 10 for safety

                // BUG FIX: getLastOpenFiles returns reverse chronological order (Recents first).
                // Reversing ensures links like 1 -> 2 -> 3 are created sequentially.
                const recentFiles = [...recentFilesArr].reverse();

                if (recentFiles.length < 2) {
                    new Notice('Need at least 2 recently opened notes.');
                    return;
                }

                const hierarchy = this.settings.hierarchies?.[0];
                if (!hierarchy) {
                    new Notice('No hierarchy configured.');
                    return;
                }

                new Notice(`Lasso: analyzing ${recentFiles.length} recent notes...`);

                let suggestions = 0;

                // 1. Suggest the first note as parent (MOC) for the rest
                const parentNote = recentFiles[0];
                const childNotes = recentFiles.slice(1);

                for (const child of childNotes) {
                    const stableId = `lasso_down:${parentNote.path}:${child.path}`;

                    // Check if relationship already exists
                    if (this.cache.suggestions.some((s: Suggestion) => s.id === stableId)) continue;

                    this.cache.suggestions.push({
                        id: stableId,
                        type: 'deterministic',
                        link: `[[${child.basename}]]`,
                        source: `Lasso Hierarchy: [[${parentNote.basename}]] proposed as parent of [[${child.basename}]].`,
                        timestamp: Date.now(),
                        category: 'suggestion',
                        meta: {
                            property: 'down',
                            propertyKey: hierarchy.down[0] || 'down',
                            sourcePath: parentNote.path,
                            targetPath: child.path,
                            sourceNote: parentNote.basename,
                            targetNote: child.basename,
                            description: `Parent-child from lasso selection`,
                        },
                    });

                    // FIX #7: Bi-directional Lasso (UP)
                    this.cache.suggestions.push({
                        id: `lasso_up:${child.path}:${parentNote.path}`,
                        type: 'deterministic',
                        link: `[[${parentNote.basename}]]`,
                        source: `Lasso Hierarchy: [[${child.basename}]] child of [[${parentNote.basename}]].`,
                        timestamp: Date.now(),
                        category: 'suggestion',
                        meta: {
                            property: 'up',
                            propertyKey: hierarchy.up[0] || 'up',
                            sourcePath: child.path,
                            targetPath: parentNote.path,
                            sourceNote: child.basename,
                            targetNote: parentNote.basename,
                            description: `Child-parent from lasso selection`,
                        },
                    });
                    suggestions += 2;
                }

                // 2. Suggest sequential (next/prev) chain among children
                for (let i = 0; i < childNotes.length - 1; i++) {
                    const current = childNotes[i];
                    const next = childNotes[i + 1];

                    const stableId = `lasso_seq:${current.path}:${next.path}`;
                    if (this.cache.suggestions.some((s: Suggestion) => s.id === stableId)) continue;

                    this.cache.suggestions.push({
                        id: stableId,
                        type: 'deterministic',
                        link: `[[${current.basename}]] â†’ [[${next.basename}]]`,
                        source: `Lasso Sequence: [[${current.basename}]] â†’ [[${next.basename}]] based on opening order.`,
                        timestamp: Date.now(),
                        category: 'suggestion',
                        meta: {
                            property: 'next',
                            propertyKey: hierarchy.next[0] || 'next',
                            sourcePath: current.path,
                            targetPath: next.path,
                            sourceNote: current.basename,
                            targetNote: next.basename,
                            description: `Sequential link from lasso order`,
                        },
                    });

                    // FIX #6: Bi-directional Lasso (PREV)
                    this.cache.suggestions.push({
                        id: `lasso_prev:${next.path}:${current.path}`,
                        type: 'deterministic',
                        link: `[[${next.basename}]] â†  [[${current.basename}]]`,
                        source: `Lasso Sequence: [[${next.basename}]] â†  [[${current.basename}]] based on opening order.`,
                        timestamp: Date.now(),
                        category: 'suggestion',
                        meta: {
                            property: 'prev',
                            propertyKey: hierarchy.prev[0] || 'prev',
                            sourcePath: next.path,
                            targetPath: current.path,
                            sourceNote: next.basename,
                            targetNote: current.basename,
                            description: `Sequential back-link from lasso order`,
                        },
                    });
                    suggestions += 2;
                }

                if (suggestions > 0) {
                    this.cache.save();
                    await this.saveSettings();
                    void this.refreshDashboard();
                    new Notice(`Lasso: ${suggestions} relationships proposed. Review in dashboard.`);
                } else {
                    new Notice('Lasso: all relationships already exist.');
                }

                void this.activateDashboard();
            },
        });
    }

    async activateDashboard() {
        const { workspace } = this.app;
        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);

        if (leaves.length > 0) {
            leaf = leaves[0];
        } else {
            leaf = workspace.getRightLeaf(false);
            if (leaf) await leaf.setViewState({ type: DASHBOARD_VIEW_TYPE, active: true });
        }
        if (leaf) await workspace.revealLeaf(leaf);
    }

    async refreshDashboard() {
        const leaves = this.app.workspace.getLeavesOfType(DASHBOARD_VIEW_TYPE);
        for (const leaf of leaves) {
            if (leaf.view instanceof QuarantineDashboardView) {
                await leaf.view.refresh();
            }
        }
    }

    verifyDependencies() {
        if (isObsidianInternalApp(this.app)) {
            const plugins = this.app.plugins;
            if (plugins && plugins.enabledPlugins) {
                if (!plugins.enabledPlugins.has('datacore')) {
                    this.logger.warn(
                        'Datacore is missing. Semantic Graph Healer requires Datacore for vault-wide queries; most analysis features will be disabled.',
                    );
                    if (plugins.enabledPlugins.has('dataview')) {
                        this.logger.warn(
                            'Dataview is installed but is not used as a full query backend. Please install Datacore for full functionality.',
                        );
                    }
                }

                if (!plugins.enabledPlugins.has('breadcrumbs')) {
                    this.logger.warn(
                        'Breadcrumbs missing. Hierarchical topology analysis will have limited capabilities.',
                    );
                }
            }
        }
    }

    private pruneStaleSuggestions(newIssues: Suggestion[]): Suggestion[] {
        // --- SMART PRUNING (v3.3.8) ---
        // We keep AI suggestions and Manual Bridge Gaps
        // but REPLACE all other topological issues with the fresh audit.
        const persistentTypes: SuggestionType[] = ['ai', 'infra', 'hybrid'];
        const persistentSuggestions = this.cache.suggestions.filter((suggestion: Suggestion) => {
            return persistentTypes.includes(suggestion.type);
        });
        return [...persistentSuggestions, ...newIssues];
    }

    public async analyzeGraph(silent = false) {
        if (this.isAnalyzing) {
            if (!silent) new Notice('Analysis already in progress...');
            return Promise.resolve();
        }

        // ABORT PREVIOUS SCAN
        if (this.currentAnalysisController) {
            this.currentAnalysisController.abort();
        }
        this.currentAnalysisController = new AbortController();

        this.isAnalyzing = true;
        this.logger.info('Analyzing graph (Smart Scrutiny)...');

        try {
            const deterministicIssues = await this.topology.runDeterministicAnalysis();
            await sleep(10);

            const cycleIssues = await this.topology.runCycleAnalysis();
            await sleep(10);

            const sinkIssues = await this.topology.runFlowStagnationAnalysis();
            await sleep(10);

            const qualityIssues = await this.quality.runQualityAnalysis();
            await sleep(10);

            const incongruenceIssues = await this.topology.runIncongruenceAnalysis();
            await sleep(10);

            // ABORT CHECK
            if (this.currentAnalysisController?.signal.aborted) return;

            // NEW: Semantic Audit (Hardened 2026 Batching)
            let semanticIssues: Suggestion[] = [];
            if (this.settings.enableSemanticAudit) {
                semanticIssues = await this.topology.runSemanticChildValidation(this.currentAnalysisController?.signal);
                await sleep(10);
            }

            // NEW: Tag Sibling Detection (integrated into global scan)
            let tagSiblings: Suggestion[] = [];
            if (this.settings.enableTagHierarchySync) {
                tagSiblings = this.topology.deriveTagSiblings();
                const tagPropagations = this.tagPropagator.runTagPropagationAnalysis();
                tagSiblings.push(...tagPropagations);
                await sleep(10);
            }

            const advancedSuggestions: Suggestion[] = [];
            if (this.settings.enableDeepGraphAnalysis) {
                advancedSuggestions.push(...(await this.analyzeDeepGraph()));
            }

            const newTopologicalIssues = [
                ...deterministicIssues,
                ...cycleIssues,
                ...sinkIssues,
                ...qualityIssues,
                ...incongruenceIssues,
                ...tagSiblings,
                ...semanticIssues, // â†  NEW
                ...advancedSuggestions,
            ];
            this.cache.suggestions = this.pruneStaleSuggestions(newTopologicalIssues);
            this.cache.save();

            if (newTopologicalIssues.length > 0) {
                new Notice(`Scrutiny complete: ${newTopologicalIssues.length} issues detected.`);
            } else {
                new Notice('Scrutiny complete: graph is healthy.');
            }

            this.refreshDashboard().catch((err) => this.logger.error('Refresh failed', err));
            await this.activateDashboard();

            this.cache.pushHistory({
                action: `Full scan: ${newTopologicalIssues.length} issues`,
                file: 'Vault',
                timestamp: Date.now(),
                type: 'scan',
            });
            await this.saveSettings();
        } catch (e) {
            this.logger.error('Analysis failed', e);
            new Notice('Analysis failed. Check console for details.');
        } finally {
            this.isAnalyzing = false;
        }
    }

    async analyzeDeepGraph(): Promise<Suggestion[]> {
        this.logger.info('Loading Advanced Graph Engine...');
        try {
            const { GraphEngine } = await import('./core/GraphEngine');
            const engine = new GraphEngine({
                app: this.app,
                settings: this.settings,
                graphWorkerService: this.graphWorkerService,
            });

            engine.buildGraph();
            await sleep(10);

            const suggestions: Suggestion[] = [];
            suggestions.push(...(await engine.runPageRankAnalysis()));
            await sleep(10);

            suggestions.push(...(await engine.runCommunityDetection()));
            await sleep(10);

            suggestions.push(...(await engine.runBetweennessAnalysis()));
            await sleep(10);

            // Co-Citation Analysis: 2nd-order backlinks (Small 1973 + SkepticMystic algorithm)
            // Uses Obsidian's resolvedLinks directly â€” works at any vault size.
            suggestions.push(...(await engine.runCoCitationAnalysis()));

            return suggestions;
        } catch (e) {
            this.logger.error('Deep analysis failed', e);
            new Notice('Deep analysis failed. See console.');
            return [];
        }
    }

    public async getApiKey(type: 'openai' | 'anthropic' | 'deepseek' | 'infranodus' | 'custom'): Promise<string> {
        return (await this.keychainService.getApiKey(type)) || 'sk-local';
    }

    async fetchInfraNodusGaps(): Promise<number> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('Open a file to run bridge analysis.');
            return 0;
        }

        const apiKey = await this.getApiKey('infranodus');
        if (!apiKey || apiKey === '') {
            this.logger.error('InfraNodus API Key missing.');
            return -1;
        }

        try {
            this.logger.info(`Querying InfraNodus for structural gaps in ${activeFile.basename}...`);
            const content = await this.app.vault.read(activeFile);

            // FIX: URL updated to current v1 API
            const response = await requestUrl({
                url: 'https://infranodus.com/api/v1/graphAndStatements',
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: content.substring(0, 4000),
                    context: activeFile.basename,
                    options: { calculate: ['gaps', 'topics'] },
                }),
            });

            if (response.status !== 200) {
                this.logger.error(`InfraNodus returned HTTP ${response.status}`);
                return -1;
            }

            // FIX: v1 response nests gaps inside graph.graphologyGraph.attributes.gaps
            const data = response.json as {
                gaps?: InfraGap[];
                graph?: {
                    graphologyGraph?: {
                        attributes?: { gaps?: InfraGap[] };
                    };
                };
            };

            const gaps: InfraGap[] = data?.graph?.graphologyGraph?.attributes?.gaps ?? data?.gaps ?? [];

            if (gaps.length === 0) {
                this.logger.info('InfraNodus: no gaps found in response.');
                return 0;
            }

            let newCount = 0;
            for (const gap of gaps) {
                const termA = String(gap.cluster_a ?? gap.node1 ?? 'unknown');
                const termB = String(gap.cluster_b ?? gap.node2 ?? 'unknown');
                const adviceText =
                    typeof gap.advice === 'string'
                        ? gap.advice
                        : typeof gap.bridging_text === 'string'
                          ? gap.bridging_text
                          : `Missing conceptual bridge between '${termA}' and '${termB}'.`;

                this.cache.suggestions.push({
                    id: generateId('infra'),
                    type: 'infra',
                    link: `[[Bridge: ${termA} & ${termB}]]`,
                    source: `InfraNodus gap: ${adviceText}`,
                    timestamp: Date.now(),
                    category: 'suggestion',
                });
                this.cache.save();
                newCount++;
            }

            if (newCount > 0) {
                await this.saveSettings();
                void this.refreshDashboard();
            }
            return newCount;
        } catch (e) {
            this.logger.error('InfraNodus API Request failed', e);
            return -1;
        }
    }

    async loadSettings() {
        const loadedData = (await this.loadData()) as Partial<SemanticGraphHealerSettings>;
        const baseSettings = Object.assign({}, DEFAULT_SETTINGS, loadedData) as SemanticGraphHealerSettings;

        // --- MIGRATION: Ensure all hierarchies have all keys (related, next, prev) ---
        if (baseSettings.hierarchies && Array.isArray(baseSettings.hierarchies)) {
            baseSettings.hierarchies = (baseSettings.hierarchies as Record<string, unknown>[]).map((h) => ({
                ...DEFAULT_SETTINGS.hierarchies[0],
                ...h,
            }));
        }

        // --- CACHE LOAD & MIGRATION ---
        await this.cache.load(
            baseSettings as unknown as {
                pendingSuggestions?: Suggestion[];
                history?: HistoryItem[];
            },
        );

        // --- ZOD VALIDATION ---
        try {
            const { SettingsSchema } = await import('./types.schema');
            const result = SettingsSchema.safeParse(baseSettings);

            if (result.success) {
                this.settings = result.data as SemanticGraphHealerSettings;
            } else {
                const errorMessage = JSON.stringify(result.error.issues, null, 2);
                this.logger.warn(
                    'Settings validation failed. Some keys may be corrupted. Using safe fallbacks.',
                    errorMessage,
                );
                this.settings = baseSettings;
            }
        } catch (e) {
            this.logger.error('Failed to load Zod schema for validation', e);
            this.settings = baseSettings;
        }

        // FIX: Ensures that there is always at least one valid hierarchy
        if (!this.settings.hierarchies || this.settings.hierarchies.length === 0) {
            this.logger.warn('No valid hierarchy found after load â€” restoring defaults.');
            this.settings.hierarchies = [...DEFAULT_SETTINGS.hierarchies];
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    /**
     * ðŸ”„ SCAN EXTERNAL TOPOLOGIES (Breadcrumbs, ExcaliBrain)
     * Hardened 2026 Sync: supports V4 edge_fields and Related links.
     */
    async syncExternalSettings(): Promise<boolean> {
        this.logger.info('Scanning for external topological engine settings...');
        try {
            let found = false;
            const h = this.settings.hierarchies[0];
            if (!h) {
                this.logger.error('No hierarchy configured for sync.');
                return false;
            }

            // HELPER: Safe array validation
            const safeArray = (val: unknown): string[] => {
                if (!Array.isArray(val)) return [];
                return val.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
            };

            // HELPER: Track new properties for notification
            const newProps: string[] = [];

            // 1. BREADCRUMBS (V3 & V4)
            const bcPath = `${this.app.vault.configDir}/plugins/breadcrumbs/data.json`;
            if (await this.app.vault.adapter.exists(bcPath)) {
                try {
                    const bcFileContent = await this.app.vault.adapter.read(bcPath);
                    const bcData = JSON.parse(bcFileContent) as {
                        hierarchies?: {
                            up?: string[];
                            down?: string[];
                            same?: string[];
                            next?: string[];
                            prev?: string[];
                        }[];
                        edge_fields?: { label: string; dir: string }[];
                    };

                    // Support V3 (hierarchies array)
                    const bcH = bcData?.hierarchies?.[0];
                    if (bcH) {
                        const beforeUp = h.up.length;
                        h.up = [...new Set([...h.up, ...safeArray(bcH.up)])];
                        if (h.up.length > beforeUp) newProps.push(...h.up.slice(beforeUp));

                        h.down = [...new Set([...h.down, ...safeArray(bcH.down)])];
                        h.same = [...new Set([...h.same, ...safeArray(bcH.same)])];
                        h.next = [...new Set([...h.next, ...safeArray(bcH.next)])];
                        h.prev = [...new Set([...h.prev, ...safeArray(bcH.prev)])];
                        found = true;
                    }

                    // Support V4 (edge_fields array)
                    if (bcData?.edge_fields && Array.isArray(bcData.edge_fields)) {
                        (bcData.edge_fields as { label: string; dir: string }[]).forEach((ef) => {
                            if (ef.dir === 'up') h.up = [...new Set([...h.up, ef.label])];
                            if (ef.dir === 'down') h.down = [...new Set([...h.down, ef.label])];
                            if (ef.dir === 'same') h.same = [...new Set([...h.same, ef.label])];
                            if (ef.dir === 'next') h.next = [...new Set([...h.next, ef.label])];
                            if (ef.dir === 'prev') h.prev = [...new Set([...h.prev, ef.label])];
                            if (ef.dir === 'related') {
                                h.related = [...new Set([...h.related, ef.label])];
                            }
                        });
                        found = true;
                    }
                } catch (e) {
                    this.logger.error('Breadcrumbs sync failed', e);
                }
            }

            // 2. EXCALIBRAIN
            const ebPath = `${this.app.vault.configDir}/plugins/excalibrain/data.json`;
            if (await this.app.vault.adapter.exists(ebPath)) {
                try {
                    const ebFileContent = await this.app.vault.adapter.read(ebPath);
                    const ebData = JSON.parse(ebFileContent) as {
                        ontology?: {
                            parent?: string[];
                            child?: string[];
                            friend?: string[];
                        };
                        hierarchy?: {
                            parent?: string[];
                            child?: string[];
                            friend?: string[];
                        };
                        propertyMapping?: Record<string, string>;
                    };

                    const ebOntology = ebData?.ontology || ebData?.hierarchy;
                    if (ebOntology) {
                        if (ebOntology.parent && Array.isArray(ebOntology.parent)) {
                            h.up = [...new Set([...h.up, ...safeArray(ebOntology.parent)])];
                        }
                        if (ebOntology.child && Array.isArray(ebOntology.child)) {
                            h.down = [...new Set([...h.down, ...safeArray(ebOntology.child)])];
                        }
                        if (ebOntology.friend && Array.isArray(ebOntology.friend)) {
                            h.same = [...new Set([...h.same, ...safeArray(ebOntology.friend)])];
                        }
                        found = true;
                    }

                    // NEW: Support ExcaliBrain property mapping for next/prev/related
                    const ebPropertyMap = ebData?.propertyMapping;
                    if (ebPropertyMap) {
                        for (const [prop, direction] of Object.entries(ebPropertyMap)) {
                            if (direction === 'next') h.next = [...new Set([...h.next, prop])];
                            if (direction === 'prev') h.prev = [...new Set([...h.prev, prop])];
                            if (direction === 'related') {
                                h.related = [...new Set([...h.related, prop])];
                            }
                        }
                        found = true;
                    }
                } catch (e) {
                    this.logger.error('ExcaliBrain sync failed', e);
                }
            }

            if (found) {
                await this.saveSettings();
                // Notify user
                if (newProps.length > 0) {
                    new Notice(`Imported ${newProps.length} new hierarchy properties from external plugins.`);
                } else {
                    new Notice('Imported hierarchy properties from external plugins.');
                }
                return true;
            }
            return false;
        } catch (e) {
            this.logger.error('External Sync failed', e);
            return false;
        }
    }

    onunload() {
        this.logger.info('Semantic Graph Healer unloading...');

        // âœ… Gold Master Refinement: Clear pending analysis timers
        this.analysisDebounce.forEach((timer) => clearTimeout(timer));
        this.analysisDebounce.clear();

        if (this.graphWorkerService) {
            void this.graphWorkerService.destroy();
        }

        // 1.5. Destroy Metadata Engine (Caches & Events)
        if (this.engine) {
            this.engine.destroy();
        }

        // 1.7. Shutdown AI Services (Interval cleanup)
        if (this.llm) {
            this.llm.destroy();
        }

        // 2. Ensure cache is flushed
        if (this.cache) {
            void this.cache.destroy();
        }

        // 3. Clear logger buffer to free memory (SOTA 2026 Audit Fix)
        if (this.logger) {
            this.logger.clearBuffer();
        }
    }
}
