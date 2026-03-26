import { App, PluginSettingTab, Setting, ButtonComponent, Notice } from 'obsidian';
import { HealerLogger, isObsidianInternalApp } from './core/HealerUtils';
import SemanticGraphHealer from './main';

export class SemanticHealerSettingTab extends PluginSettingTab {
    plugin: SemanticGraphHealer;

    constructor(app: App, plugin: SemanticGraphHealer) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // --- INJECT CUSTOM BANNER ---
        const bannerPath = this.app.vault.adapter.getResourcePath(this.plugin.manifest.dir + '/banner.png');
        const bannerEl = containerEl.createEl('img');
        bannerEl.src = bannerPath;
        bannerEl.addClass('healer-settings-banner');

        const createHeader = (title: string, desc: string) => {
            const setting = new Setting(containerEl).setHeading().setName(title).setDesc(desc);
            setting.settingEl.addClass('healer-category-header');
            return setting.settingEl;
        };

        // --- 1. CORE ---
        createHeader('Core', 'General rules for the link analyzer and scan scope.');

        new Setting(containerEl)
            .setName('Scan folder')
            .setDesc('Specific folder to scan for topological inconsistencies. Default is / (entire vault).')
            .addText((text) =>
                text
                    .setPlaceholder('/')
                    .setValue(this.plugin.settings.scanFolder)
                    .onChange((value) => {
                        this.plugin.settings.scanFolder = value;
                        void this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Auto-fix mundane links')
            .setDesc('Automatically heal exact inverse relationships (a-parent-b -> b-child-a) without prompting.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.autoFixMundaneLinks).onChange((value) => {
                    this.plugin.settings.autoFixMundaneLinks = value;
                    void this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName('Ignore orphan notes')
            .setDesc('Hide warnings for notes with no hierarchical links in the dashboard.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.ignoreOrphanNotes).onChange((value) => {
                    this.plugin.settings.ignoreOrphanNotes = value;
                    void this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName('Include other hubs')
            .setDesc('Enable scanning for additional file types')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.includeNonMarkdownHubs).onChange((value) => {
                    this.plugin.settings.includeNonMarkdownHubs = value;
                    void this.plugin.saveSettings();
                }),
            );

        // --- 2. INTEGRATIONS ---
        createHeader('Integrations', 'Connect with other plugins for enhanced intelligence.');

        new Setting(containerEl)
            .setName('Smart connections integration')
            .setDesc('Use smart connections embeddings to find semantically related nodes during discovery.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.enableSmartConnections).onChange((value) => {
                    this.plugin.settings.enableSmartConnections = value;
                    void (async () => {
                        await this.plugin.saveSettings();
                        this.display(); // Refresh to show/hide limit
                    })();
                }),
            );

        if (this.plugin.settings.enableSmartConnections) {
            new Setting(containerEl)
                .setName('Smart connections limit')
                .setDesc('Number of semantic neighbors to retrieve.')
                .addSlider((slider) =>
                    slider
                        .setLimits(1, 20, 1)
                        .setValue(this.plugin.settings.smartConnectionsLimit)
                        .setDynamicTooltip()
                        .onChange((value) => {
                            this.plugin.settings.smartConnectionsLimit = value;
                            void this.plugin.saveSettings();
                        }),
                );
        }

        // --- 3. HIERARCHIES ---
        createHeader('Hierarchies', 'Map specific properties to topological directions.');

        const h = this.plugin.settings.hierarchies[0];
        if (h) {
            new Setting(containerEl)
                .setName('Upward properties (parent)')
                .setDesc('Comma-separated list of properties treated as "up" (parent) nodes.')
                .addText((text) =>
                    text.setValue(h.up.join(', ')).onChange((value) => {
                        h.up = value
                            .split(',')
                            .map((s) => s.trim())
                            .filter((s) => s);
                        void this.plugin.saveSettings();
                    }),
                );

            new Setting(containerEl)
                .setName('Downward properties (child)')
                .setDesc('Comma-separated list of properties treated as "down" (child) nodes.')
                .addText((text) =>
                    text.setValue(h.down.join(', ')).onChange((value) => {
                        h.down = value
                            .split(',')
                            .map((s) => s.trim())
                            .filter((s) => s);
                        void this.plugin.saveSettings();
                    }),
                );

            new Setting(containerEl)
                .setName('Sibling properties')
                .setDesc('Comma-separated list of properties treated as sibling (same-level) elements.')
                .addText((text) =>
                    text.setValue(h.same.join(', ')).onChange((value) => {
                        h.same = value
                            .split(',')
                            .map((s) => s.trim())
                            .filter((s) => s);
                        void this.plugin.saveSettings();
                    }),
                );

            new Setting(containerEl)
                .setName('Strict down-hierarchy validation')
                .setDesc(
                    'Enforce 1-to-1 relationships for child properties (down) by default. If disabled, multiple children are allowed without error.',
                )
                .addToggle((toggle) =>
                    toggle.setValue(this.plugin.settings.strictDownCheck).onChange((value) => {
                        this.plugin.settings.strictDownCheck = value;
                        void (async () => {
                            await this.plugin.saveSettings();
                            await this.plugin.analyzeGraph();
                        })();
                    }),
                );

            const customRulesSetting = new Setting(containerEl)
                .setName('Custom topology rules')
                .setDesc(
                    'Define specific constraints for certain folders or properties using JSON and regex. Overrides global strictness.',
                );
            customRulesSetting.settingEl.addClass('healer-block-setting');
            customRulesSetting.addTextArea((text) => {
                text.setValue(JSON.stringify(this.plugin.settings.customTopologyRules, null, 2));
                text.inputEl.rows = 6;
                text.inputEl.addClass('healer-json-textarea');
                text.setPlaceholder(
                    '[\n  { "pattern": "^Projects/", "property": "up", "maxCount": 2, "severity": "info" }\n]',
                );
                text.onChange(async (v) => {
                    try {
                        const parsed = JSON.parse(v);
                        // Validation logic would go here if needed, or let Zod handle it on load
                        this.plugin.settings.customTopologyRules = parsed;
                        await this.plugin.saveSettings();
                        await this.plugin.analyzeGraph();
                        text.inputEl.removeClass('healer-border-error');
                    } catch {
                        text.inputEl.addClass('healer-border-error');
                    }
                });
            });
        }

        // --- 3. RULES ---
        createHeader('Rules', 'Advanced graph logic constraints for automated analysis.');

        new Setting(containerEl)
            .setName('Implied symmetric edges')
            .setDesc(
                'Assume that if node a links to node b, node b should link back to node a with the inverse relation.',
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.impliedSymmetricEdges).onChange(async (v) => {
                    this.plugin.settings.impliedSymmetricEdges = v;
                    await this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName('Implied transitive siblings')
            .setDesc(
                'If node a and node b share the same parent, automatically treat them as siblings in semantic history.',
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.impliedTransitiveSiblings).onChange((value) => {
                    this.plugin.settings.impliedTransitiveSiblings = value;
                    void this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName('Detect missing skips')
            .setDesc(
                'Identify non-consecutive jumps (e.g., parent linking directly to grandchild, skipping the child node).',
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.detectTaxonomicSkips).onChange((value) => {
                    this.plugin.settings.detectTaxonomicSkips = value;
                    void this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName('Regex exclusion filter')
            .setDesc(
                'Skip files matching this pattern (e.g., ^Templates/.*). Useful for excluding large attachment folders.',
            )
            .addText((text) =>
                text.setValue(this.plugin.settings.regexExclusionFilter).onChange((value) => {
                    this.plugin.settings.regexExclusionFilter = value;
                    void this.plugin.saveSettings();
                }),
            );

        // --- 5. Deep analytics ---
        createHeader('Graph metrics', 'Advanced graph analysis');

        new Setting(containerEl)
            .setName('Enable deep graph analysis')
            .setDesc('Run analytical metrics to find pillars and clusters')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.enableDeepGraphAnalysis).onChange((value) => {
                    this.plugin.settings.enableDeepGraphAnalysis = value;
                    void this.plugin.saveSettings();
                }),
            );

        // --- 6. MULTI-PROVIDER LLM ---
        createHeader(
            'Primary model configuration',
            'Main intelligence engine. Note: only local models (e.g. Ollama) are free — cloud providers charge per token. Check your provider.',
        );

        new Setting(containerEl)
            .setName('Endpoint address')
            .setDesc('Server address for the primary model endpoint.')
            .addText((text) =>
                text
                    .setPlaceholder('Enter address...')
                    .setValue(this.plugin.settings.llmEndpoint)
                    .onChange((value) => {
                        this.plugin.settings.llmEndpoint = value;
                        void this.plugin.saveSettings();
                    }),
            );

        new Setting(containerEl)
            .setName('Model key')
            .setDesc('Securely stored key for the primary model.')
            .addText((text) => {
                text.setPlaceholder('Enter key...').setValue(this.plugin.settings.llmApiKey);
                text.inputEl.type = 'password';
                text.onChange((value) => {
                    void (async () => {
                        const internalApp = this.plugin.app;
                        if (isObsidianInternalApp(internalApp)) {
                            if (internalApp.keychain && value !== 'sk-local' && value !== '') {
                                await internalApp.keychain.set('semantic-healer-primary', value);
                                this.plugin.settings.llmApiKey = '';
                            } else {
                                this.plugin.settings.llmApiKey = value;
                            }
                            await this.plugin.saveSettings();
                        }
                    })();
                });
            });

        new Setting(containerEl)
            .setName('Primary model selection')
            .setDesc('Select the target model from the detected choices on your primary endpoint.')
            .addDropdown((dropdown) => {
                const models = this.plugin.settings.detectedModels || [];
                models.forEach((m: string) => {
                    dropdown.addOption(m, m);
                });
                dropdown.setValue(this.plugin.settings.llmModelName).onChange((value) => {
                    this.plugin.settings.llmModelName = value;
                    void (async () => {
                        await this.plugin.saveSettings();
                        this.display(); // Refresh to update diversity check
                    })();
                });
            });

        new Setting(containerEl)
            .setName('Detect primary models')
            .setDesc('Scan the primary endpoint for available models.')
            .addButton((btn) =>
                btn.setButtonText('Scan primary').onClick(async () => await this.runModelDetection(btn, true)),
            );

        // --- 5. THE AI TRIBUNAL ---
        createHeader(
            'Verification engine',
            'Secondary model for consensus. Uses additional tokens — local models recommended to avoid extra costs.',
        );

        new Setting(containerEl)
            .setName('Enable verification (AI tribunal)')
            .setDesc('If enabled, all suggestions must be confirmed by a secondary independent model.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.enableAiTribunal).onChange((value) => {
                    this.plugin.settings.enableAiTribunal = value;
                    void (async () => {
                        await this.plugin.saveSettings();
                        this.display(); // Refresh to show diversity warning
                    })();
                }),
            );

        if (this.plugin.settings.enableAiTribunal) {
            const isRedundant =
                this.plugin.settings.llmModelName === this.plugin.settings.secondaryLlmModelName &&
                this.plugin.settings.llmEndpoint === this.plugin.settings.secondaryLlmEndpoint;

            if (isRedundant) {
                containerEl.createEl('div', {
                    text: '⚠️ warning: primary and secondary providers are identical. The tribunal will be bypassed to save tokens.',
                    cls: 'healer-warning-banner',
                });
            }
        }

        new Setting(containerEl)
            .setName('Secondary endpoint address')
            .setDesc('Independent server for the secondary model verification.')
            .addText((text) =>
                text.setValue(this.plugin.settings.secondaryLlmEndpoint).onChange((value) => {
                    this.plugin.settings.secondaryLlmEndpoint = value;
                    void this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName('Secondary model key')
            .setDesc('Secure key for the verification endpoint.')
            .addText((text) => {
                text.setPlaceholder('Enter key...').setValue(this.plugin.settings.secondaryLlmApiKey);
                text.inputEl.type = 'password';
                text.onChange((value) => {
                    void (async () => {
                        const internalApp = this.plugin.app;
                        if (isObsidianInternalApp(internalApp)) {
                            if (internalApp.keychain && value !== '') {
                                await internalApp.keychain.set('semantic-healer-secondary', value);
                                this.plugin.settings.secondaryLlmApiKey = '';
                            } else {
                                this.plugin.settings.secondaryLlmApiKey = value;
                            }
                            await this.plugin.saveSettings();
                        }
                    })();
                });
            });

        new Setting(containerEl)
            .setName('Secondary model selection')
            .setDesc('Select the target verification model.')
            .addDropdown((dropdown) => {
                const models = this.plugin.settings.secondaryDetectedModels || [];
                models.forEach((m: string) => {
                    dropdown.addOption(m, m);
                });
                dropdown.setValue(this.plugin.settings.secondaryLlmModelName).onChange((value) => {
                    this.plugin.settings.secondaryLlmModelName = value;
                    void (async () => {
                        await this.plugin.saveSettings();
                        this.display(); // Refresh to update diversity check
                    })();
                });
            });

        new Setting(containerEl)
            .setName('Detect secondary models')
            .setDesc('Scan the provided secondary endpoint for verification models.')
            .addButton((btn) =>
                btn.setButtonText('Scan secondary').onClick(async () => await this.runModelDetection(btn, false)),
            );

        // --- 6. SHARED AI PARAMETERS ---
        createHeader(
            'Shared parameters',
            'Global generation parameters. Higher token limits increase cloud API costs — local models are unaffected.',
        );

        const confidenceSetting = new Setting(containerEl)
            .setName('Confidence threshold')
            .setDesc('Minimum confidence score required for suggestions to be presented.');
        const confidenceValue = confidenceSetting.controlEl.createSpan({ cls: 'healer-slider-value' });
        confidenceValue.setText(`${this.plugin.settings.aiConfidenceThreshold}%`);
        confidenceValue.addClass('healer-ml-20');
        confidenceValue.addClass('healer-font-weight-bold');
        confidenceValue.addClass('healer-text-accent');

        confidenceSetting.addSlider((slider) =>
            slider
                .setLimits(50, 100, 1)
                .setValue(this.plugin.settings.aiConfidenceThreshold)
                .setDynamicTooltip()
                .onChange((value) => {
                    this.plugin.settings.aiConfidenceThreshold = value;
                    confidenceValue.setText(`${String(value)}%`);
                    void this.plugin.saveSettings();
                }),
        );

        const tokensSetting = new Setting(containerEl)
            .setName('Max output tokens')
            .setDesc('Limit the length of generated structural reasoning.');
        const tokensValue = tokensSetting.controlEl.createSpan({ cls: 'healer-slider-value' });
        tokensValue.setText(`${this.plugin.settings.aiMaxTokens}`);
        tokensValue.addClass('healer-ml-20');
        tokensValue.addClass('healer-font-weight-bold');

        tokensSetting.addSlider((slider) =>
            slider
                .setLimits(100, 4000, 100)
                .setValue(this.plugin.settings.aiMaxTokens)
                .setDynamicTooltip()
                .onChange((value) => {
                    this.plugin.settings.aiMaxTokens = value;
                    tokensValue.setText(`${String(value)}`);
                    void this.plugin.saveSettings();
                }),
        );

        // --- 7. INTELLIGENT EVOLUTION ---
        createHeader('Intelligent evolution', 'Dynamic MOC management and aesthetics for complex vaults.');

        new Setting(containerEl)
            .setName('Enable temporal analysis')
            .setDesc('Validate topological edges against "chronos_date" properties to prevent chronological paradoxes.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.enableTemporalAnalysis).onChange((value) => {
                    this.plugin.settings.enableTemporalAnalysis = value;
                    void this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName('Enable dynamic ontology evolution')
            .setDesc('Automatically suggest the creation of new MOCs when folder saturation exceeds thresholds.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.enableDynamicOntologyEvolution).onChange((value) => {
                    this.plugin.settings.enableDynamicOntologyEvolution = value;
                    void (async () => {
                        await this.plugin.saveSettings();
                        this.display(); // Show/hide threshold slider
                    })();
                }),
            );

        if (this.plugin.settings.enableDynamicOntologyEvolution) {
            const mocSetting = new Setting(containerEl)
                .setName('Saturation threshold')
                .setDesc('Number of child links after which sub-categories are suggested.');
            const mocValue = mocSetting.controlEl.createSpan({ cls: 'healer-slider-value' });
            mocValue.setText(`${this.plugin.settings.mocSaturationThreshold}`);
            mocValue.addClass('healer-ml-20');
            mocValue.addClass('healer-font-weight-bold');

            mocSetting.addSlider((slider) =>
                slider
                    .setLimits(5, 100, 1)
                    .setValue(this.plugin.settings.mocSaturationThreshold)
                    .setDynamicTooltip()
                    .onChange((value) => {
                        this.plugin.settings.mocSaturationThreshold = value;
                        mocValue.setText(`${String(value)}`);
                        void this.plugin.saveSettings();
                    }),
            );
        }

        new Setting(containerEl)
            .setName('Enable hierarchy sync')
            .setDesc('Dynamically map nested tags to topological linkages using dataview.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.enableTagHierarchySync).onChange((value) => {
                    this.plugin.settings.enableTagHierarchySync = value;
                    void this.plugin.saveSettings();
                }),
            );

        const aestheticSetting = new Setting(containerEl)
            .setName('Aesthetic rules (JSON)')
            .setDesc('Define node colors and stickers based on metadata properties. Must be valid JSON.');
        aestheticSetting.settingEl.addClass('healer-block-setting'); // Let's add this to CSS
        aestheticSetting.addTextArea((text) => {
            text.setValue(this.plugin.settings.aestheticPresetRules);
            text.inputEl.rows = 8;
            text.inputEl.addClass('healer-json-textarea');
            text.onChange((value) => {
                try {
                    JSON.parse(value);
                    this.plugin.settings.aestheticPresetRules = value;
                    void this.plugin.saveSettings();
                    text.inputEl.removeClass('healer-border-error');
                } catch {
                    text.inputEl.addClass('healer-border-error');
                }
            });
        });

        // --- 8. EXPERIMENTAL FEATURES & PERSONA ---
        createHeader('Experimental features', 'Non-standard modules and persona behavior constraints.');

        new Setting(containerEl)
            .setName('Persona preset')
            .setDesc('Select the "soul" of your AI healer. Each preset changes the reasoning style.')
            .addDropdown((dropdown) =>
                dropdown
                    .addOptions({
                        technician: 'Ontology Technician (Cold/Precise)',
                        architect: 'Graph Architect (Hierarchical/flow)',
                        artist: 'Semantic Artist (Evocative/Deep)',
                        custom: 'Custom Persona',
                    })
                    .setValue(this.plugin.settings.aiPersonaPreset)
                    .onChange((value) => {
                        this.plugin.settings.aiPersonaPreset = value;
                        void (async () => {
                            await this.plugin.saveSettings();
                            this.display(); // Refresh to show/hide custom prompt
                        })();
                    }),
            );

        if (this.plugin.settings.aiPersonaPreset === 'custom') {
            new Setting(containerEl)
                .setName('Custom prompt template')
                .setDesc('Override instruction prompt for analysis. Use only if persona is set to custom.')
                .addTextArea((text) =>
                    text
                        .setPlaceholder('Enter system prompt...')
                        .setValue(this.plugin.settings.customAiPersonaPrompt)
                        .onChange((value) => {
                            this.plugin.settings.customAiPersonaPrompt = value;
                            void this.plugin.saveSettings();
                        }),
                );
        }

        new Setting(containerEl)
            .setName('Enable consistency filter')
            .setDesc('Apply strict boundaries to model output parsing to ensure Obsidian compatibility.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.enableKarpathyFilter).onChange((value) => {
                    this.plugin.settings.enableKarpathyFilter = value;
                    void this.plugin.saveSettings();
                }),
            );

        // --- 9. SYNC INTEGRATION ---
        createHeader('Sync integration', 'Compatibility with external topological engines.');

        new Setting(containerEl)
            .setName('Sync from breadcrumbs / excalibrain')
            .setDesc('Scan for existing taxonomies in breadcrumbs or excalibrain data folders and import them.')
            .addButton((btn) =>
                btn
                    .setButtonText('Sync data now')
                    .setCta()
                    .onClick(async () => {
                        btn.setButtonText('Scanning...');
                        btn.setDisabled(true);
                        const success = await this.plugin.syncExternalSettings();
                        if (success) {
                            new Notice('Topologies successfully imported from external plugins!');
                            this.display();
                        } else {
                            new Notice('No compatible settings found in breadcrumbs or excalibrain.');
                            btn.setButtonText('Sync data now');
                            btn.setDisabled(false);
                        }
                    }),
            );

        // --- 10. INFRANODUS SYNERGY ---
        createHeader('Network synergy', 'Advanced science and structural gap analysis.');

        new Setting(containerEl)
            .setName('Enable network integration')
            .setDesc('Toggle advanced network analysis via external services.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.enableInfraNodus).onChange((value) => {
                    this.plugin.settings.enableInfraNodus = value;
                    void this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName('InfraNodus API token')
            .setDesc('Enter your secure token for the InfraNodus network analysis service.')
            .addText((text) => {
                text.setPlaceholder('Enter InfraNodus token...').setValue(this.plugin.settings.infraNodusApiKey);
                text.inputEl.type = 'password';
                text.onChange(async (v) => {
                    const internalApp = this.plugin.app;
                    if (isObsidianInternalApp(internalApp)) {
                        if (internalApp.keychain && v !== '') {
                            await internalApp.keychain.set('semantic-healer-infranodus', v);
                            this.plugin.settings.infraNodusApiKey = '';
                        } else {
                            this.plugin.settings.infraNodusApiKey = v;
                        }
                        await this.plugin.saveSettings();
                    }
                });
            });

        new Setting(containerEl)
            .setName('Fetch structural gaps')
            .setDesc('Identify missing links between clusters using network science.')
            .addButton((btn) =>
                btn.setButtonText('Fetch gaps').onClick(async () => {
                    btn.setButtonText('Querying service...');
                    const count = await this.plugin.fetchInfraNodusGaps();
                    if (count > 0) {
                        new Notice(`System identified ${count} structural gaps! Review actions.`);
                    } else if (count === 0) {
                        new Notice('No structural gaps detected the active note.');
                    } else {
                        new Notice('Service error. Check token.');
                    }
                    btn.setButtonText('Fetch gaps');
                }),
            );

        // --- 11. EXHAUSTED NOTES TRACKING ---
        createHeader('Exhausted notes tracking', 'AI will skip scanning these notes until the list is reset.');

        new Setting(containerEl)
            .setName('Exhausted notes count')
            .setDesc(`Number of notes marked as fully scanned: ${this.plugin.settings.fullyScannedNotes.length}`)
            .addButton((btn) =>
                btn.setButtonText('Reset scanned notes').onClick(async () => {
                    this.plugin.settings.fullyScannedNotes = [];
                    await this.plugin.saveSettings();
                    new Notice('Exhausted notes list cleared.');
                    this.display();
                }),
            );

        // --- 12. BLACKLIST MANAGEMENT ---
        createHeader('Blacklist management', 'Manage ignored suggestions and persistent exclusions.');

        new Setting(containerEl)
            .setName('Proximity ignore list')
            .setDesc(`You have ${this.plugin.settings.proximityIgnoreList.length} items currently ignored.`)
            .addButton((btn) =>
                btn
                    .setButtonText('Clear blacklist')
                    .setWarning()
                    .onClick(async () => {
                        this.plugin.settings.proximityIgnoreList = [];
                        await this.plugin.saveSettings();
                        new Notice('Blacklist cleared.');
                        this.display();
                    }),
            );

        this.plugin.settings.proximityIgnoreList.slice(-10).forEach((link: string) => {
            const s = new Setting(containerEl).setName(link).addButton((btn) =>
                btn
                    .setIcon('cross')
                    .setTooltip('Remove from ignore list')
                    .onClick(async () => {
                        this.plugin.settings.proximityIgnoreList = this.plugin.settings.proximityIgnoreList.filter(
                            (l: string) => l !== link,
                        );
                        await this.plugin.saveSettings();
                        this.display();
                    }),
            );
            s.settingEl.addClass('healer-setting-compact');
            s.infoEl.addClass('healer-setting-info-small');
        });
    }

    async runModelDetection(button: ButtonComponent, isPrimary: boolean) {
        const endpoint = isPrimary ? this.plugin.settings.llmEndpoint : this.plugin.settings.secondaryLlmEndpoint;
        const apiKey = isPrimary ? await this.plugin.getApiKey(true) : await this.plugin.getApiKey(false);
        const cloudFallbacks = [
            'gpt-4o',
            'chatgpt-4o-latest',
            'claude-3-5-sonnet',
            'o1-mini',
            'gemini-1.5-pro',
            'gemini-1.5-flash',
        ];

        try {
            button.setButtonText('Scanning...');
            button.setDisabled(true);
            new Notice(`Testing ${isPrimary ? 'primary' : 'secondary'} connection...`);

            const models = await this.plugin.llm.runModelDetection(endpoint, apiKey);

            if (isPrimary) {
                this.plugin.settings.detectedModels =
                    models.length > 0 ? [...new Set([...models, ...cloudFallbacks])] : cloudFallbacks;
                if (models.length > 0) this.plugin.settings.llmModelName = models[0];
            } else {
                this.plugin.settings.secondaryDetectedModels =
                    models.length > 0 ? [...new Set([...models, ...cloudFallbacks])] : cloudFallbacks;
                if (models.length > 0) this.plugin.settings.secondaryLlmModelName = models[0];
            }

            await this.plugin.saveSettings();
            new Notice(
                models.length > 0
                    ? `Success: Detected ${models.length} models.`
                    : 'No server models detected. Falling back to SOTA cloud presets.',
            );
            this.display();
        } catch (e) {
            HealerLogger.error('Model detection failed', e);
            new Notice(`Detection failed. Check endpoint or firewall.`);
        } finally {
            button.setDisabled(false);
            button.setButtonText(isPrimary ? 'Scan primary' : 'Scan secondary');
        }
    }
}
