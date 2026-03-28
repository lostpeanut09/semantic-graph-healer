import { Plugin, Notice, WorkspaceLeaf, requestUrl, TFile } from 'obsidian';
import {
    DASHBOARD_VIEW_TYPE,
    SemanticGraphHealerSettings,
    DEFAULT_SETTINGS,
    Suggestion,
    SuggestionType,
} from './types';
import { HealerLogger, formatRagPrompt, isObsidianInternalApp, generateId, sleep } from './core/HealerUtils';
import { TopologyAnalyzer } from './core/TopologyAnalyzer';
import { QualityAnalyzer } from './core/QualityAnalyzer';
import { LlmService } from './core/LlmService';
import { VaultDataAdapter } from './core/DataAdapter';
import { SuggestionExecutor } from './core/SuggestionExecutor';
import { ReasoningService } from './core/ReasoningService';
import { QuarantineDashboardView, ReasoningView, REASONING_VIEW_TYPE } from './DashboardView';
import { SemanticHealerSettingTab } from './SettingsTab';

export default class SemanticGraphHealer extends Plugin {
    settings: SemanticGraphHealerSettings;

    public topology: TopologyAnalyzer;
    public quality: QualityAnalyzer;
    public llm: LlmService;
    public engine: VaultDataAdapter;
    public executor: SuggestionExecutor;
    public reasoner: ReasoningService;

    private isAnalyzing = false;
    private analysisDebounce = new Map<string, NodeJS.Timeout>();

    async onload() {
        await this.loadSettings();

        // 1. Initialize Infrastructure & Services
        this.engine = new VaultDataAdapter(this.app);
        this.executor = new SuggestionExecutor(this);
        this.llm = new LlmService(this.settings, (primary) => this.getApiKey(primary));
        this.topology = new TopologyAnalyzer(this.app, this.settings, this.engine);
        this.quality = new QualityAnalyzer(this.app, this.settings, this.engine);
        this.reasoner = new ReasoningService(this.app, this.settings, this.llm, this.engine.getDataviewApi());

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
    }

    /**
     * Sharing & Sync Integrity: React to external data.json changes (e.g. Obsidian Sync).
     * SOTA 2026 Resilience: Full hot-reload of all analytical dependencies.
     */
    async onExternalSettingsChange() {
        try {
            HealerLogger.info('External settings change detected. Re-initializing engine...');
            await this.loadSettings();

            // 1. Hot Reload Infrastructure
            this.engine = new VaultDataAdapter(this.app);

            // 2. Hot Reload Logic Services
            this.llm = new LlmService(this.settings, (primary) => this.getApiKey(primary));
            this.topology = new TopologyAnalyzer(this.app, this.settings, this.engine);
            this.quality = new QualityAnalyzer(this.app, this.settings, this.engine);
            this.reasoner = new ReasoningService(this.app, this.settings, this.llm, this.engine.getDataviewApi());

            // 3. Hot Reload Executor (needs plugin reference)
            this.executor = new SuggestionExecutor(this);

            HealerLogger.info('Hot reload complete. UI refresh triggered.');
            void this.refreshDashboard().catch((e) => HealerLogger.error('Sync Refresh failed', e));
        } catch (e) {
            HealerLogger.error('Failed to handle external settings change', e);
        }
    }

    private registerVaultEvents() {
        const triggerAnalysis = (file: TFile, force = false) => {
            // Check if user is currently viewing/editing this file
            const activeFile = this.app.workspace.getActiveFile();
            if (!force && activeFile && activeFile.path === file.path) {
                HealerLogger.info(`Skipping analysis for active file: ${file.basename}. Will retry on focus change.`);
                return;
            }

            if (this.analysisDebounce.has(file.path)) {
                clearTimeout(this.analysisDebounce.get(file.path));
            }

            const timer = setTimeout(() => {
                if (this.isAnalyzing) return;
                void this.analyzeFileContext(file);
                this.analysisDebounce.delete(file.path);
            }, 1000);

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
                const isMd = file.extension === 'md';
                const isCanvas = file.extension === 'canvas' && this.settings.includeNonMarkdownHubs;

                if (isMd || isCanvas) {
                    // triggerAnalysis(file); // [Performance Fix] Disabling vault-wide bridge scan on save
                }
            }),
        );

        // 3. Focus Change Event (Trigger analysis on the file we just left)
        let lastFile: TFile | null = null;
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                const currentFile = this.app.workspace.getActiveFile();
                if (lastFile && (!currentFile || lastFile.path !== currentFile.path)) {
                    HealerLogger.info(`Context switched from: ${lastFile.basename}. Triggering deferred analysis...`);
                    triggerAnalysis(lastFile, true);
                }
                lastFile = currentFile;
            }),
        );
    }

    private async analyzeFileContext(file: TFile) {
        if (this.isAnalyzing) return;
        try {
            const bridgeIssues = await this.topology.runBridgeScrutiny();
            if (bridgeIssues.length > 0) {
                // FIX: Deduplication using Stable ID (ID deterministico strutturale)
                const newIssues = bridgeIssues.filter(
                    (bi: Suggestion) => !this.settings.pendingSuggestions.some((ps: Suggestion) => ps.id === bi.id),
                );

                if (newIssues.length > 0) {
                    this.settings.pendingSuggestions.push(...newIssues);
                    new Notice(`Structural gap detected for ${file.basename}!`);
                    await this.saveSettings();
                    void this.refreshDashboard();
                }
            }
        } catch (e) {
            HealerLogger.error('Bridge audit failed', e);
        }
    }

    private async initializeSecurity() {
        // Ensure default cloud models are present
        const cloudFallbacks = ['gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5-pro', 'gpt-4-turbo', 'o1-mini'];

        let settingsChanged = false;
        if (!this.settings.detectedModels || this.settings.detectedModels.length === 0) {
            this.settings.detectedModels = [...cloudFallbacks];
            settingsChanged = true;
        }
        if (!this.settings.secondaryDetectedModels || this.settings.secondaryDetectedModels.length === 0) {
            this.settings.secondaryDetectedModels = [...cloudFallbacks];
            settingsChanged = true;
        }

        if (isObsidianInternalApp(this.app)) {
            const keychain = this.app.keychain;
            if (keychain) {
                HealerLogger.debug('Obsidian Keychain detected. Securing API keys...');
                if (this.settings.llmApiKey && this.settings.llmApiKey !== 'sk-local') {
                    await keychain.set('semantic-healer-primary', this.settings.llmApiKey);
                    this.settings.llmApiKey = '';
                    settingsChanged = true;
                }
                if (this.settings.secondaryLlmApiKey) {
                    await keychain.set('semantic-healer-secondary', this.settings.secondaryLlmApiKey);
                    this.settings.secondaryLlmApiKey = '';
                    settingsChanged = true;
                }
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
                    HealerLogger.error('Failed to open Graph Healer Dashboard', e);
                    new Notice('Error opening the dashboard.');
                }
            },
        });

        this.addCommand({
            id: 'auto-fix-all-mundane',
            name: 'Auto-fix safe links',
            callback: async () => {
                const safeOnes = this.settings.pendingSuggestions.filter(
                    (s) => s.type === 'deterministic' && s.meta?.property,
                );
                if (safeOnes.length === 0) {
                    new Notice('No safe reciprocal fixes pending.');
                    return;
                }
                let fixed = 0;
                for (const s of safeOnes) {
                    const success = await this.executor.execute(s);
                    if (success) fixed++;
                }
                new Notice(`Auto-fixed ${fixed} safe links.`);
            },
        });

        // SOTA 2026: CLI-optimized command for automation
        this.addCommand({
            id: 'analyze-silent',
            name: 'Run silent graph analysis (CLI)',
            callback: async () => {
                HealerLogger.info('CLI: Silent analysis triggered.');
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
                            this.settings.pendingSuggestions.push(...scSuggestions);
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
                                this.settings.pendingSuggestions.push({
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
                            await this.saveSettings();
                            new Notice('New links suggested.');
                            void this.refreshDashboard();
                        }
                    }
                } catch (e) {
                    HealerLogger.error('Proximity Error', e);
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
                        (s) => s.meta?.sourceNote === activeFile.basename || s.meta?.targetNote === activeFile.basename,
                    );

                    const combined = [...parentSuggestions, ...relevantSiblings];

                    if (combined.length > 0) {
                        // Deduplicate against existing
                        const newOnes = combined.filter(
                            (s) => !this.settings.pendingSuggestions.some((p) => p.id === s.id),
                        );
                        if (newOnes.length > 0) {
                            this.settings.pendingSuggestions.push(...newOnes);
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
                    HealerLogger.error('Tag Sync Error', e);
                }
            },
        });

        this.addCommand({
            id: 'build-lasso-hierarchy',
            name: 'Build lasso hierarchy (recent notes)',
            callback: async () => {
                const recentPaths = this.app.workspace.getLastOpenFiles();

                // Filter to only valid markdown files
                const recentFiles = recentPaths
                    .map((p) => this.app.vault.getAbstractFileByPath(p))
                    .filter((f): f is TFile => f instanceof TFile && f.extension === 'md')
                    .slice(0, 10); // Cap at 10 for safety

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
                    if (this.settings.pendingSuggestions.some((s) => s.id === stableId)) continue;

                    this.settings.pendingSuggestions.push({
                        id: stableId,
                        type: 'deterministic',
                        link: `[[${child.basename}]]`,
                        source: `Lasso Hierarchy: [[${parentNote.basename}]] proposed as parent of [[${child.basename}]] (based on recent activity).`,
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
                    suggestions++;
                }

                // 2. Suggest sequential (next/prev) chain among children
                for (let i = 0; i < childNotes.length - 1; i++) {
                    const current = childNotes[i];
                    const next = childNotes[i + 1];

                    const stableId = `lasso_seq:${current.path}:${next.path}`;
                    if (this.settings.pendingSuggestions.some((s) => s.id === stableId)) continue;

                    this.settings.pendingSuggestions.push({
                        id: stableId,
                        type: 'deterministic',
                        link: `[[${current.basename}]] → [[${next.basename}]]`,
                        source: `Lasso Sequence: [[${current.basename}]] → [[${next.basename}]] based on opening order.`,
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
                    suggestions++;
                }

                if (suggestions > 0) {
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
                await leaf.view.onOpen();
            }
        }
    }

    verifyDependencies() {
        if (isObsidianInternalApp(this.app)) {
            const plugins = this.app.plugins;
            if (plugins && plugins.enabledPlugins) {
                if (!plugins.enabledPlugins.has('dataview')) {
                    HealerLogger.warn('Dataview missing.');
                }
            }
        }
    }

    private pruneStaleSuggestions(newIssues: Suggestion[]): Suggestion[] {
        // --- SMART PRUNING (v3.3.8) ---
        // We keep AI suggestions and Manual Bridge Gaps
        // but REPLACE all other topological issues with the fresh audit.
        const persistentTypes: SuggestionType[] = ['ai', 'infra', 'semantic'];
        const persistentSuggestions = this.settings.pendingSuggestions.filter((suggestion) => {
            return persistentTypes.includes(suggestion.type);
        });
        return [...persistentSuggestions, ...newIssues];
    }

    public async analyzeGraph(silent = false) {
        if (this.isAnalyzing) {
            if (!silent) new Notice('Analysis already in progress...');
            return;
        }
        this.isAnalyzing = true;
        HealerLogger.info('Analyzing graph (Smart Scrutiny)...');

        try {
            const deterministicIssues = this.topology.runDeterministicAnalysis();
            await sleep(10);

            const cycleIssues = this.topology.runCycleAnalysis();
            await sleep(10);

            const sinkIssues = this.topology.runFlowStagnationAnalysis();
            await sleep(10);

            const qualityIssues = await this.quality.runQualityAnalysis();
            await sleep(10);

            const incongruenceIssues = this.topology.runIncongruenceAnalysis();
            await sleep(10);

            // NEW: Tag Sibling Detection (integrated into global scan)
            let tagSiblings: Suggestion[] = [];
            if (this.settings.enableTagHierarchySync) {
                tagSiblings = this.topology.deriveTagSiblings();
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
                ...tagSiblings, // ← NEW
                ...advancedSuggestions,
            ];
            this.settings.pendingSuggestions = this.pruneStaleSuggestions(newTopologicalIssues);

            if (newTopologicalIssues.length > 0) {
                new Notice(`Scrutiny complete: ${newTopologicalIssues.length} issues detected.`);
            } else {
                new Notice('Scrutiny complete: graph is healthy.');
            }

            this.refreshDashboard().catch((err) => HealerLogger.error('Refresh failed', err));
            await this.activateDashboard();

            this.settings.history.push({
                action: `Full scan: ${newTopologicalIssues.length} issues`,
                file: 'Vault',
                timestamp: Date.now(),
                type: 'scan',
            });
            await this.saveSettings();
        } catch (e) {
            HealerLogger.error('Analysis failed', e);
            new Notice('Analysis failed. Check console for details.');
        } finally {
            this.isAnalyzing = false;
        }
    }

    async analyzeDeepGraph(): Promise<Suggestion[]> {
        HealerLogger.info('Loading Advanced Graph Engine...');
        try {
            const { GraphEngine } = await import('./core/GraphEngine');
            const engine = new GraphEngine(this.app);

            engine.buildGraph();
            await sleep(10);

            const suggestions: Suggestion[] = [];
            suggestions.push(...engine.runPageRankAnalysis());
            await sleep(10);

            suggestions.push(...engine.runCommunityDetection());
            await sleep(10);

            suggestions.push(...engine.runBetweennessAnalysis());

            return suggestions;
        } catch (e) {
            HealerLogger.error('Deep analysis failed', e);
            new Notice('Deep analysis failed. See console.');
            return [];
        }
    }

    async getApiKey(isPrimary: boolean): Promise<string> {
        if (isObsidianInternalApp(this.app)) {
            const keychain = this.app.keychain;
            if (keychain) {
                const key = await keychain.get(isPrimary ? 'semantic-healer-primary' : 'semantic-healer-secondary');
                if (key) return key;
            }
        }
        return isPrimary ? this.settings.llmApiKey : this.settings.secondaryLlmApiKey;
    }

    async getInfraNodusApiKey(): Promise<string> {
        if (isObsidianInternalApp(this.app)) {
            const keychain = this.app.keychain;
            if (keychain) {
                const key = await keychain.get('semantic-healer-infranodus');
                if (key) return key;
            }
        }
        return this.settings.infraNodusApiKey;
    }

    async fetchInfraNodusGaps(): Promise<number> {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) {
            new Notice('Open a file to run bridge analysis.');
            return 0;
        }

        const apiKey = await this.getInfraNodusApiKey();
        if (!apiKey || apiKey === '') {
            HealerLogger.error('InfraNodus API Key missing.');
            return -1;
        }

        try {
            HealerLogger.info(`Querying InfraNodus for structural gaps in ${activeFile.basename}...`);
            const content = await this.app.vault.read(activeFile);

            const response = await requestUrl({
                url: 'https://api.infranodus.com/api/texts',
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: content.substring(0, 4000),
                    options: ['gaps', 'topics'],
                }),
            });

            if (response.status === 200) {
                const data = response.json as {
                    gaps?: { cluster_a: string; cluster_b: string; advice: string | Record<string, unknown> }[];
                };
                const gaps = data.gaps || [];
                let newCount = 0;

                gaps.forEach(
                    (gap: { cluster_a: string; cluster_b: string; advice: string | Record<string, unknown> }) => {
                        const adviceText =
                            typeof gap.advice === 'string'
                                ? gap.advice
                                : JSON.stringify(gap.advice ?? 'Missing connection');
                        this.settings.pendingSuggestions.push({
                            id: generateId('infra'),
                            type: 'infra',
                            link: `[[Bridge: ${String(gap.cluster_a)} & ${String(gap.cluster_b)}]]`,
                            source: `InfraNodus gap: ${adviceText}`,
                            timestamp: Date.now(),
                            category: 'suggestion',
                        });
                        newCount++;
                    },
                );

                if (newCount > 0) {
                    await this.saveSettings();
                    void this.refreshDashboard();
                }
                return newCount;
            }
            return -1;
        } catch (e) {
            HealerLogger.error('InfraNodus API Request failed', e);
            return -1;
        }
    }

    onunload() {
        this.analysisDebounce.forEach((timer) => clearTimeout(timer));
        this.analysisDebounce.clear();
        HealerLogger.info('Unloading Semantic Graph Healer');
    }

    async loadSettings() {
        const loadedData = (await this.loadData()) as Partial<SemanticGraphHealerSettings>;
        const baseSettings = Object.assign({}, DEFAULT_SETTINGS, loadedData) as SemanticGraphHealerSettings;

        // --- MIGRATION: Ensure all suggestions have a type field ---
        interface LegacySuggestion {
            id?: string;
            type?: SuggestionType;
            [key: string]: unknown;
        }

        if (baseSettings.pendingSuggestions && Array.isArray(baseSettings.pendingSuggestions)) {
            baseSettings.pendingSuggestions = (baseSettings.pendingSuggestions as unknown as LegacySuggestion[]).map(
                (s) => {
                    let type: SuggestionType = s.type || 'ai';
                    const id = s.id || '';
                    if (
                        id.startsWith('orphan:') ||
                        id.startsWith('dangling:') ||
                        id.startsWith('moc_sat:') ||
                        id.startsWith('quality:') ||
                        id.startsWith('asymmetry:') ||
                        id.startsWith('bridge_gap:') ||
                        id.startsWith('tag_sync:')
                    ) {
                        type = 'deterministic';
                    } else if (id.startsWith('incongruence:')) {
                        type = 'incongruence';
                    } else if (id.startsWith('infra:')) {
                        type = 'infra';
                    } else if (id.startsWith('sc_match:')) {
                        type = 'semantic';
                    } else if (id.startsWith('suggest:') || id.startsWith('smart_')) {
                        type = 'ai';
                    }
                    return { ...s, type } as unknown as Suggestion;
                },
            );
        }

        // --- ZOD VALIDATION ---
        try {
            const { SettingsSchema } = await import('./types.schema');
            const result = SettingsSchema.safeParse(baseSettings);

            if (result.success) {
                this.settings = baseSettings;
            } else {
                const { z } = await import('zod');
                HealerLogger.warn(
                    'Settings validation failed. Some keys may be corrupted. Using safe fallbacks.',
                    z.treeifyError(result.error),
                );
                this.settings = baseSettings;
            }
        } catch (e) {
            HealerLogger.error('Failed to load Zod schema for validation', e);
            this.settings = baseSettings;
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async syncExternalSettings() {
        HealerLogger.info('Scanning for external topological engine settings...');
        try {
            let found = false;
            const bcPath = `${this.app.vault.configDir}/plugins/breadcrumbs/data.json`;
            if (await this.app.vault.adapter.exists(bcPath)) {
                const bcFileContent = await this.app.vault.adapter.read(bcPath);
                const bcData = JSON.parse(bcFileContent) as {
                    hierarchies?: { up?: string[]; down?: string[]; same?: string[] }[];
                };
                if (bcData?.hierarchies?.[0]) {
                    const bcH = bcData.hierarchies[0];
                    if (this.settings.hierarchies[0]) {
                        this.settings.hierarchies[0].up = [
                            ...new Set([...this.settings.hierarchies[0].up, ...(bcH.up || [])]),
                        ];
                        this.settings.hierarchies[0].down = [
                            ...new Set([...this.settings.hierarchies[0].down, ...(bcH.down || [])]),
                        ];
                        this.settings.hierarchies[0].same = [
                            ...new Set([...this.settings.hierarchies[0].same, ...(bcH.same || [])]),
                        ];
                        found = true;
                    }
                }
            }

            const ebPath = `${this.app.vault.configDir}/plugins/excalibrain/data.json`;
            if (await this.app.vault.adapter.exists(ebPath)) {
                found = true;
            }

            if (found) {
                await this.saveSettings();
                return true;
            }
            return false;
        } catch (e) {
            HealerLogger.error('Sync failed', e);
            return false;
        }
    }
}
