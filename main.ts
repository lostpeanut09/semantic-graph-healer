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

    private isAnalyzing = false; // [Audit Fix #9]

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
    }

    private registerVaultEvents() {
        const analysisDebounce = new Map<string, NodeJS.Timeout>();

        const triggerAnalysis = (file: TFile, force = false) => {
            // Check if user is currently viewing/editing this file
            const activeFile = this.app.workspace.getActiveFile();
            if (!force && activeFile && activeFile.path === file.path) {
                HealerLogger.info(`Skipping analysis for active file: ${file.basename}. Will retry on focus change.`);
                return;
            }

            if (analysisDebounce.has(file.path)) {
                clearTimeout(analysisDebounce.get(file.path));
            }

            const timer = setTimeout(() => {
                if (this.isAnalyzing) return;
                void this.analyzeFileContext(file);
                analysisDebounce.delete(file.path);
            }, 1000);

            analysisDebounce.set(file.path, timer);
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
                    triggerAnalysis(file);
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
                    (bi) => !this.settings.pendingSuggestions.some((ps) => ps.id === bi.id),
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
                HealerLogger.info('Obsidian Keychain detected. Securing API keys...');
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
                    const suggestions = this.topology.deriveTagSuggestions(tags, activeFile.path);

                    if (suggestions.length > 0) {
                        this.settings.pendingSuggestions.push(...suggestions);
                        await this.saveSettings();
                        void this.refreshDashboard();
                        new Notice(`Derived ${suggestions.length} mapping(s).`);
                    }
                } catch (e) {
                    HealerLogger.error('Tag Sync Error', e);
                }
            },
        });

        this.addCommand({
            id: 'build-lasso-hierarchy',
            name: 'Build lasso hierarchy (multi-select)',
            callback: () => {
                const files = this.app.workspace.getLastOpenFiles();
                if (files.length < 2) {
                    new Notice('Select at least 2 notes.');
                    return;
                }
                new Notice('Lasso captured: mapping will begin soon');
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
        const persistentTypes: SuggestionType[] = ['ai', 'infra'];
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
                const data = response.json;
                const gaps = data.gaps || [];
                let newCount = 0;

                gaps.forEach(
                    (gap: { cluster_a: string; cluster_b: string; advice: string | Record<string, unknown> }) => {
                        const adviceText =
                            typeof gap.advice === 'string'
                                ? gap.advice
                                : JSON.stringify(gap.advice || 'Missing connection');
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
        HealerLogger.info('Unloading Semantic Graph Healer');
    }

    async loadSettings() {
        const loadedData = await this.loadData();
        const baseSettings = Object.assign({}, DEFAULT_SETTINGS, loadedData);

        // --- MIGRATION: Ensure all suggestions have a type field ---
        interface LegacySuggestion {
            id?: string;
            type?: SuggestionType;
            [key: string]: unknown;
        }

        if (baseSettings.pendingSuggestions && Array.isArray(baseSettings.pendingSuggestions)) {
            baseSettings.pendingSuggestions = baseSettings.pendingSuggestions.map((s: LegacySuggestion) => {
                let type: SuggestionType = s.type || 'ai';
                const id = s.id || '';
                if (
                    id.startsWith('deter_') ||
                    id.startsWith('asymmetry') ||
                    id.startsWith('tag_sync') ||
                    id.startsWith('bridge_gap')
                ) {
                    type = 'deterministic';
                } else if (
                    id.startsWith('orphan_') ||
                    id.startsWith('dangly_') ||
                    id.startsWith('moc_sat_') ||
                    id.startsWith('quality_')
                ) {
                    type = 'quality';
                } else if (id.startsWith('incongruence')) {
                    type = 'incongruence';
                } else if (id.startsWith('infra_')) {
                    type = 'infra';
                } else if (id.startsWith('suggest_') || id.startsWith('smart_')) {
                    type = 'ai';
                }
                return { ...s, type };
            });
        }

        // --- ZOD VALIDATION ---
        try {
            const { SettingsSchema } = await import('./types.schema');
            const result = SettingsSchema.safeParse(baseSettings);

            if (result.success) {
                this.settings = result.data as unknown as SemanticGraphHealerSettings;
            } else {
                HealerLogger.warn(
                    'Settings validation failed. Some keys may be corrupted. Using safe fallbacks.',
                    result.error.format(),
                );
                this.settings = baseSettings as unknown as SemanticGraphHealerSettings;
            }
        } catch (e) {
            HealerLogger.error('Failed to load Zod schema for validation', e);
            this.settings = baseSettings as SemanticGraphHealerSettings;
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
                const bcData = JSON.parse(await this.app.vault.adapter.read(bcPath));
                if (bcData?.hierarchies?.[0]) {
                    const bcH = bcData.hierarchies[0] as { up: string[]; down: string[]; same: string[] };
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
