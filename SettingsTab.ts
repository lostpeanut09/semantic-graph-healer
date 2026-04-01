import { App, PluginSettingTab, Setting, ButtonComponent, Notice, Modal } from 'obsidian';
import { HealerLogger, isObsidianInternalApp } from './core/HealerUtils';
import SemanticGraphHealer from './main';
import { DEFAULT_SETTINGS, SettingsPreset, SemanticGraphHealerSettings } from './types';

export class SemanticHealerSettingTab extends PluginSettingTab {
    plugin: SemanticGraphHealer;

    constructor(app: App, plugin: SemanticGraphHealer) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * Helper to set CSS properties on an element to satisfy ESLint.
     */
    private setCssProps(el: HTMLElement, props: Record<string, string>) {
        for (const [key, value] of Object.entries(props)) {
            el.style.setProperty(key, value);
        }
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        // --- INJECT CUSTOM BANNER ---
        // ✅ Hardened manifest access for v1.3.0
        const manifest = this.plugin.manifest as typeof this.plugin.manifest & { dir?: string };
        const dir = manifest.dir ?? `plugins/${manifest.id}`;
        const bannerPath = this.app.vault.adapter.getResourcePath(`${dir}/banner.png`);
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
                .addSlider((slider) => {
                    slider
                        .setLimits(1, 20, 1)
                        .setValue(this.plugin.settings.smartConnectionsLimit)
                        .setDynamicTooltip()
                        .onChange((value) => {
                            this.plugin.settings.smartConnectionsLimit = value;
                            void this.plugin.saveSettings();
                        });
                    if ('setInstant' in slider) {
                        (slider as { setInstant(v: boolean): void }).setInstant(true);
                    }
                });
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
                .setName('Next properties (sequential)')
                .setDesc('Comma-separated list of properties treated as "next" in a sequence.')
                .addText((text) =>
                    text.setValue(h.next.join(', ')).onChange((value) => {
                        h.next = value
                            .split(',')
                            .map((s) => s.trim())
                            .filter((s) => s);
                        void this.plugin.saveSettings();
                    }),
                );

            new Setting(containerEl)
                .setName('Previous properties (sequential)')
                .setDesc('Comma-separated list of properties treated as "previous" in a sequence.')
                .addText((text) =>
                    text.setValue(h.prev.join(', ')).onChange((value) => {
                        h.prev = value
                            .split(',')
                            .map((s) => s.trim())
                            .filter((s) => s);
                        void this.plugin.saveSettings();
                    }),
                );

            new Setting(containerEl)
                .setName('Sibling properties (symmetric)')
                .setDesc(
                    'Comma-separated list of properties treated as symmetric siblings. Missing reciprocals will be flagged.',
                )
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
                .setName('Related properties (unidirectional)')
                .setDesc(
                    'Comma-separated list for non-hierarchical contextual mentions. These are unidirectional and never flagged as errors.',
                )
                .addText((text) =>
                    text.setValue(h.related.join(', ')).onChange((value) => {
                        h.related = value
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
            let rulesDebounce: number;
            customRulesSetting.addTextArea((text) => {
                text.setValue(JSON.stringify(this.plugin.settings.customTopologyRules, null, 2));
                text.inputEl.rows = 6;
                text.inputEl.addClass('healer-json-textarea');
                text.setPlaceholder(
                    '[\n  { "pattern": "^Projects/", "property": "up", "maxCount": 2, "severity": "info" }\n]',
                );
                text.onChange((v) => {
                    if (rulesDebounce) window.clearTimeout(rulesDebounce);
                    rulesDebounce = window.setTimeout(() => {
                        void (async () => {
                            try {
                                const parsed = JSON.parse(v) as {
                                    pattern: string;
                                    property: string;
                                    maxCount: number;
                                    severity: 'info' | 'error' | 'suggestion';
                                }[];
                                this.plugin.settings.customTopologyRules = parsed;
                                await this.plugin.saveSettings();
                                await this.plugin.analyzeGraph();
                                text.inputEl.removeClass('healer-border-error');
                            } catch {
                                text.inputEl.addClass('healer-border-error');
                            }
                        })();
                    }, 1000);
                });
            });
        }

        // --- 3. Rules ---
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

        // --- 6. Multi-provider LLM ---
        createHeader(
            'Primary model configuration',
            'Main intelligence engine. Note: only local models (e.g. Ollama) are free — cloud providers charge per token. Check your provider.',
        );

        if (!this.plugin.settings.detectedModels || this.plugin.settings.detectedModels.length === 0) {
            containerEl.createDiv({
                cls: 'healer-warning-banner',
                text: 'First time? Enter your endpoint and key, then click "Detect primary models" to populate the choices.',
            });
        }

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
            .setDesc(
                'Securely stored key for the model. For local models, enter "sk-local". For cloud apis, enter the real key.',
            )
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
                (this.plugin.settings.detectedModels || []).forEach((m: string) => {
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

        // --- 5. RESILIENCE & RELIABILITY ---
        createHeader('Resilience and reliability', 'AI reliability and retry logic.');

        new Setting(containerEl)
            .setName('Llm max retries')
            .setDesc('Number of times to retry a failed AI query before giving up.')
            .addSlider((slider) => {
                slider
                    .setLimits(0, 5, 1)
                    .setValue(this.plugin.settings.llmMaxRetries || 2)
                    .setDynamicTooltip()
                    .onChange((value) => {
                        this.plugin.settings.llmMaxRetries = value;
                        void this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Retry on status codes')
            .setDesc('Comma-separated list of HTTP status codes that trigger a retry (e.g., 429, 408, 503).')
            .addText((text) =>
                text.setValue(this.plugin.settings.llmRetryableStatuses.join(', ')).onChange((value) => {
                    this.plugin.settings.llmRetryableStatuses = value
                        .split(',')
                        .map((s) => parseInt(s.trim()))
                        .filter((n) => !isNaN(n));
                    void this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName('Generation temperature')
            .setDesc('Higher values (0.8+) are more creative, lower values (0.2) are more deterministic.')
            .addSlider((slider) => {
                slider
                    .setLimits(0, 1, 0.1)
                    .setValue(this.plugin.settings.aiTemperature ?? 0.7)
                    .setDynamicTooltip()
                    .onChange((value) => {
                        this.plugin.settings.aiTemperature = value;
                        void this.plugin.saveSettings();
                    });
            });

        // --- 7. The AI tribunal ---
        createHeader('Verification engine', 'Secondary model for consensus. Uses additional tokens.');

        new Setting(containerEl)
            .setName('Enable verification')
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
                    text: 'Primary and secondary providers are identical. The tribunal will be bypassed to save tokens.',
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
            .setDesc(
                'Secure key for the verification endpoint. For local models, enter "sk-local". For cloud apis, enter the real key.',
            )
            .addText((text) => {
                text.setPlaceholder('Enter key...').setValue(this.plugin.settings.secondaryLlmApiKey);
                text.inputEl.type = 'password';
                text.onChange((value) => {
                    void (async () => {
                        const internalApp = this.plugin.app;
                        if (isObsidianInternalApp(internalApp)) {
                            const isSkLocal = value === 'sk-local';
                            if (internalApp.keychain && value !== '' && !isSkLocal) {
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

        // --- 6. Shared AI parameters ---
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

        confidenceSetting.addSlider((slider) => {
            slider
                .setLimits(50, 100, 1)
                .setValue(this.plugin.settings.aiConfidenceThreshold)
                .setDynamicTooltip()
                .onChange((value) => {
                    this.plugin.settings.aiConfidenceThreshold = value;
                    confidenceValue.setText(`${String(value)}%`);
                    void this.plugin.saveSettings();
                });
            if ('setInstant' in slider) {
                (slider as { setInstant(v: boolean): void }).setInstant(true);
            }
        });

        const tokensSetting = new Setting(containerEl)
            .setName('Max output tokens')
            .setDesc('Limit the length of generated structural reasoning.');
        const tokensValue = tokensSetting.controlEl.createSpan({ cls: 'healer-slider-value' });
        tokensValue.setText(`${this.plugin.settings.aiMaxTokens}`);
        tokensValue.addClass('healer-ml-20');
        tokensValue.addClass('healer-font-weight-bold');

        tokensSetting.addSlider((slider) => {
            slider
                .setLimits(100, 4000, 100)
                .setValue(this.plugin.settings.aiMaxTokens)
                .setDynamicTooltip()
                .onChange((value) => {
                    this.plugin.settings.aiMaxTokens = value;
                    tokensValue.setText(`${String(value)}`);
                    void this.plugin.saveSettings();
                });
            if ('setInstant' in slider) {
                (slider as { setInstant(v: boolean): void }).setInstant(true);
            }
        });

        // --- 7. Intelligent evolution ---
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
            .setDesc('Suggest the creation of new maps of content when folder saturation exceeds thresholds.')
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
                .setName('Moc saturation threshold')
                .setDesc('Number of child links after which sub-categories are suggested.');
            const mocValue = mocSetting.controlEl.createSpan({ cls: 'healer-slider-value' });
            mocValue.setText(`${this.plugin.settings.mocSaturationThreshold}`);
            mocValue.addClass('healer-ml-20');
            mocValue.addClass('healer-font-weight-bold');

            mocSetting.addSlider((slider) => {
                slider
                    .setLimits(5, 100, 1)
                    .setValue(this.plugin.settings.mocSaturationThreshold)
                    .setDynamicTooltip()
                    .onChange((value) => {
                        this.plugin.settings.mocSaturationThreshold = value;
                        mocValue.setText(`${String(value)}`);
                        void this.plugin.saveSettings();
                    });
                if ('setInstant' in slider) {
                    (slider as { setInstant(v: boolean): void }).setInstant(true);
                }
            });
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
        let aestheticDebounce: number;
        aestheticSetting.addTextArea((text) => {
            text.setValue(this.plugin.settings.aestheticPresetRules);
            text.inputEl.rows = 8;
            text.inputEl.addClass('healer-json-textarea');
            text.onChange((value) => {
                if (aestheticDebounce) window.clearTimeout(aestheticDebounce);
                aestheticDebounce = window.setTimeout(() => {
                    void (async () => {
                        try {
                            JSON.parse(value);
                            this.plugin.settings.aestheticPresetRules = value;
                            await this.plugin.saveSettings();
                            text.inputEl.removeClass('healer-border-error');
                        } catch {
                            text.inputEl.addClass('healer-border-error');
                        }
                    })();
                }, 1000);
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
            .setName('Sync from external plugins')
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
                            // ✅ NEW: Trigger analysis with new hierarchies
                            new Notice('Running graph analysis with new hierarchy...');
                            await this.plugin.analyzeGraph();
                        } else {
                            new Notice('No compatible settings found in breadcrumbs or excalibrain.');
                        }
                        btn.setButtonText('Sync data now');
                        btn.setDisabled(false);
                    }),
            );

        // --- 10. EXPERIMENTAL AI INFERENCE (PHASE 3) ---
        createHeader(
            'Phase 3: AI Inference (Experimental)',
            'Advanced semantic reasoning and topological validation using Llms (Local or Cloud).',
        );

        new Setting(containerEl)
            .setName('Require related reciprocity')
            .setDesc('Force reciprocity even for weak "related" links using AI validation.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.requireRelatedReciprocity).onChange((value) => {
                    this.plugin.settings.requireRelatedReciprocity = value;
                    void this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName('Allow multiple next branches')
            .setDesc('Permit a note to have multiple sequential continuations without topological errors.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.allowNextBranching).onChange((value) => {
                    this.plugin.settings.allowNextBranching = value;
                    void this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName('Allow multiple prev branches')
            .setDesc('Permit a note to have multiple sequential predecessors without topological errors.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.allowPrevBranching).onChange((value) => {
                    this.plugin.settings.allowPrevBranching = value;
                    void this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName('Branch validation')
            .setDesc('On-demand verification for next and previous branches. Independent from the automated tribunal.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.requireAIBranchValidation).onChange((value) => {
                    this.plugin.settings.requireAIBranchValidation = value;
                    void this.plugin.saveSettings();
                }),
            );

        new Setting(containerEl)
            .setName('Tag propagation')
            .setDesc('Suggest updates for child tags based on context.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.requireAITagValidation).onChange((value) => {
                    this.plugin.settings.requireAITagValidation = value;
                    void this.plugin.saveSettings();
                }),
            );

        // --- 11. INFRANODUS SYNERGY ---
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
            .setName('Token')
            .setDesc('Enter your secure token for the infranodus network analysis service.')
            .addText((text) => {
                text.setPlaceholder('Enter infranodus token...').setValue(this.plugin.settings.infraNodusApiKey);
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
                        new Notice('No structural gaps detected in the active note.');
                    } else {
                        new Notice('Service error. Check token.');
                    }
                    btn.setButtonText('Fetch gaps');
                }),
            );

        // --- PHASE 1: SECURITY API KEYS ---
        createHeader('Security API keys', 'Secure management of Llm and service credentials.');

        const keychainStatus = this.plugin.keychainService?.isSecure() ?? false;

        new Setting(containerEl)
            .setName('Keychain status')
            .setDesc(
                keychainStatus
                    ? 'Obsidian Keychain active. Your keys are encrypted at the OS level.'
                    : 'Keychain NOT detected. Keys are currently saved in plain text data.json.',
            )
            .addButton((button) => {
                button
                    .setButtonText(keychainStatus ? 'Verify connection' : 'Migrate results')
                    .setCta()
                    .onClick(async () => {
                        if (keychainStatus) {
                            const result = await this.plugin.keychainService.validateKeychain();
                            new Notice(result.available ? 'Keychain validation successful.' : `Error: ${result.error}`);
                        } else {
                            await this.plugin.keychainService.migrateFromSettingsToKeychain('openai');
                            new Notice('Critical migration complete.');
                            this.display();
                        }
                    });
            });

        new Setting(containerEl)
            .setName('Primary analysis key')
            .setDesc('Vault-wide API key for analysis. Saved to system keychain if available.')
            .addText((text) =>
                text
                    .setPlaceholder('Enter key')
                    .setValue('') // Hide value for security
                    .onChange(async (value) => {
                        if (value) {
                            await this.plugin.keychainService.setApiKey('openai', value);
                            new Notice('Key secured and synchronized.');
                        }
                    }),
            );

        // --- PHASE 1: LOGGING & DEBUG ---
        createHeader('Logging and debug', 'Fine-grained control over plugin diagnostics.');

        new Setting(containerEl)
            .setName('Log level')
            .setDesc('Level of verbosity for internal logs.')
            .addDropdown((dropdown) => {
                dropdown
                    .addOptions({
                        debug: 'Debug (all noise)',
                        info: 'Info (Standard)',
                        warn: 'Warn (Issues only)',
                        error: 'Error (Critical only)',
                    })
                    .setValue(this.plugin.settings.logLevel)
                    .onChange(async (value: 'debug' | 'info' | 'warn' | 'error') => {
                        this.plugin.settings.logLevel = value;
                        await this.plugin.saveSettings();
                        this.plugin.logger.setLevel(value);
                    });
            });

        new Setting(containerEl)
            .setName('Persistence')
            .setDesc('Write logs to a dedicated file in the vault.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.enableFileLogging).onChange(async (value) => {
                    this.plugin.settings.enableFileLogging = value;
                    await this.plugin.saveSettings();
                    this.plugin.logger.setFileLogging(value);
                }),
            );

        new Setting(containerEl)
            .setName('Archive logs')
            .setDesc('Generate a Markdown diagnostic report.')
            .addButton((btn) =>
                btn.setButtonText('Export log').onClick(async () => {
                    const logs = this.plugin.logger.exportLogs();
                    const stats = this.plugin.logger.getStats();
                    const content = `# Diagnostic Report: Semantic Graph Healer\n- Generated: ${new Date().toISOString()}\n- Total Entries: ${stats.total}\n\n\`\`\`\n${logs}\n\`\`\``;
                    const path = `plugins/${this.plugin.manifest.id}/diagnostic-export.md`;
                    await this.app.vault.create(path, content);
                    new Notice(`Exported to ${path}`);
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

        // --- 13. SETTINGS PROFILES ---
        createHeader('Settings profiles', 'Quick-load configuration presets for different use cases.');

        new Setting(containerEl)
            .setName('Load preset')
            .setDesc('Quick-load a configuration preset. Current settings will be overridden.')
            .addDropdown((dropdown) => {
                dropdown
                    .addOption('balanced', 'Balanced (default)')
                    .addOption('privacy', 'Privacy-first (no cloud AI)')
                    .addOption('ai-maximal', 'Ai-maximal (all features)')
                    .addOption('performance', 'Performance (large vaults)')
                    .setValue('balanced')
                    .onChange(async (value: string) => {
                        const presetVal = value as SettingsPreset;
                        const confirmed = await new Promise<boolean>((resolve) => {
                            const modal = new Modal(this.app);
                            modal.titleEl.setText('Load preset');
                            modal.contentEl.createEl('p', {
                                text: `Load the "${value}" preset? This will override your current settings (API keys preserved).`,
                            });
                            const buttonContainer = modal.contentEl.createDiv({ cls: 'healer-modal-buttons' });
                            this.setCssProps(buttonContainer, {
                                display: 'flex',
                                'justify-content': 'flex-end',
                                gap: '10px',
                                'margin-top': '20px',
                            });

                            let resolved = false;
                            const safeResolve = (val: boolean) => {
                                if (!resolved) {
                                    resolved = true;
                                    resolve(val);
                                }
                            };
                            modal.onClose = () => safeResolve(false);

                            new ButtonComponent(buttonContainer).setButtonText('Cancel').onClick(() => {
                                modal.close();
                                safeResolve(false);
                            });

                            new ButtonComponent(buttonContainer)
                                .setButtonText('Load')
                                .setCta()
                                .onClick(() => {
                                    modal.close();
                                    safeResolve(true);
                                });

                            modal.open();
                        });

                        if (confirmed) {
                            const presets: Record<SettingsPreset, Partial<SemanticGraphHealerSettings>> = {
                                balanced: {
                                    enableSmartConnections: true,
                                    enableAiTribunal: false,
                                    requireAITagValidation: true,
                                    allowNextBranching: false,
                                    maxNodes: 5000,
                                    logLevel: 'info',
                                },
                                privacy: {
                                    enableSmartConnections: false,
                                    enableAiTribunal: false,
                                    requireAITagValidation: false,
                                    llmEndpoint: 'http://localhost:11434/v1',
                                    logLevel: 'warn',
                                },
                                'ai-maximal': {
                                    enableSmartConnections: true,
                                    enableAiTribunal: true,
                                    requireAITagValidation: true,
                                    requireAIBranchValidation: true,
                                    requireRelatedReciprocity: true,
                                    logLevel: 'debug',
                                },
                                performance: {
                                    enableSmartConnections: false,
                                    enableAiTribunal: false,
                                    requireAITagValidation: false,
                                    maxNodes: 2000,
                                    maxEdges: 20000,
                                    enableDeepGraphAnalysis: false,
                                    logLevel: 'error',
                                },
                            };

                            this.plugin.settings = { ...this.plugin.settings, ...presets[presetVal] };
                            await this.plugin.saveSettings();
                            new Notice(`"${value}" preset loaded.`);
                            this.display();
                        }
                    });
            });

        // --- 14. ADVANCED MAINTENANCE ---
        createHeader('Advanced maintenance', 'Plugin maintenance, backup and reset options.');

        new Setting(containerEl)
            .setName('Export settings')
            .setDesc('Export current settings to a JSON file for backup or sharing.')
            .addButton((button) => {
                button.setButtonText('Export').onClick(async () => {
                    const settingsExport = { ...this.plugin.settings } as Record<string, unknown>;
                    // FIX: Aggressive Sanitization (Don't leak even encrypted keys if they guess the salt)
                    Object.keys(settingsExport).forEach((k) => {
                        if (k.toLowerCase().includes('apikey') || k.endsWith('Encrypted')) {
                            delete settingsExport[k];
                        }
                    });

                    const content = JSON.stringify(settingsExport, null, 2);
                    const path = `semantic-graph-healer-backup-${Date.now()}.json`;
                    await this.app.vault.create(path, content);
                    new Notice(`Settings exported to root folder as ${path}`);
                });
            });

        new Setting(containerEl)
            .setName('Import settings')
            .setDesc('Import settings from a JSON file. Overwrites current configuration.')
            .addButton((button) => {
                button.setButtonText('Import').onClick(() => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.json';
                    input.onchange = async (e: Event) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (!file) return;
                        const content = await file.text();
                        try {
                            const imported = JSON.parse(content) as Record<string, unknown>;
                            const { SettingsSchema } = await import('./types.schema');
                            const result = SettingsSchema.safeParse(imported);
                            if (result.success) {
                                this.plugin.settings = {
                                    ...this.plugin.settings,
                                    ...(result.data as Partial<SemanticGraphHealerSettings>),
                                };
                                await this.plugin.saveSettings();
                                new Notice('Settings imported successfully.');
                                this.display();
                            } else {
                                new Notice('Invalid settings file format.');
                                HealerLogger.error('Schema validation failed during import', result.error);
                            }
                        } catch (err: unknown) {
                            new Notice('Failed to parse settings file.');
                            HealerLogger.error('Settings parse failed', err);
                        }
                    };
                    input.click();
                });
            });

        // --- 11. PERFORMANCE & SYSTEM RESOURCES (SOTA 2026 Audit) ---
        createHeader('Performance & system resources', 'Optimization for large vaults and execution safety.');

        new Setting(containerEl)
            .setName('Enable graph guardrails')
            .setDesc('Prevent UI freezes by capping the number of nodes and edges in the analytical graph.')
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.enableGraphGuardrails).onChange((value) => {
                    this.plugin.settings.enableGraphGuardrails = value;
                    void (async () => {
                        await this.plugin.saveSettings();
                        this.display(); // Refresh to show/hide limits
                    })();
                }),
            );

        if (this.plugin.settings.enableGraphGuardrails) {
            const nodeSetting = new Setting(containerEl)
                .setName('Max graph nodes')
                .setDesc('Maximum number of notes to include in analysis. Recommended: 5000.');
            const nodeValue = nodeSetting.controlEl.createSpan({ cls: 'healer-slider-value' });
            nodeValue.setText(`${this.plugin.settings.maxNodes}`);
            nodeValue.addClass('healer-ml-20');
            nodeValue.addClass('healer-font-weight-bold');

            nodeSetting.addSlider((slider) => {
                slider
                    .setLimits(1000, 20000, 500)
                    .setValue(this.plugin.settings.maxNodes)
                    .setDynamicTooltip()
                    .onChange((value) => {
                        this.plugin.settings.maxNodes = value;
                        nodeValue.setText(`${String(value)}`);
                        void this.plugin.saveSettings();
                    });
                if ('setInstant' in slider) {
                    (slider as { setInstant(v: boolean): void }).setInstant(true);
                }
            });

            const edgeSetting = new Setting(containerEl)
                .setName('Max graph edges')
                .setDesc('Maximum number of links for analysis. Recommended: 50000.');
            const edgeValue = edgeSetting.controlEl.createSpan({ cls: 'healer-slider-value' });
            edgeValue.setText(`${this.plugin.settings.maxEdges}`);
            edgeValue.addClass('healer-ml-20');
            edgeValue.addClass('healer-font-weight-bold');

            edgeSetting.addSlider((slider) => {
                slider
                    .setLimits(5000, 100000, 5000)
                    .setValue(this.plugin.settings.maxEdges)
                    .setDynamicTooltip()
                    .onChange((value) => {
                        this.plugin.settings.maxEdges = value;
                        edgeValue.setText(`${String(value)}`);
                        void this.plugin.saveSettings();
                    });
                if ('setInstant' in slider) {
                    (slider as { setInstant(v: boolean): void }).setInstant(true);
                }
            });
        }

        const cacheSetting = new Setting(containerEl)
            .setName('Alias cache ttl')
            .setDesc('Time-to-live for the alias resolution index (minutes).');
        const cacheValue = cacheSetting.controlEl.createSpan({ cls: 'healer-slider-value' });
        // Setting values are in ms, UI in minutes
        cacheValue.setText(`${Math.round(this.plugin.settings.aliasCacheTtl / 60000)}m`);
        cacheValue.addClass('healer-ml-20');
        cacheValue.addClass('healer-font-weight-bold');

        cacheSetting.addSlider((slider) => {
            slider
                .setLimits(1, 60, 1)
                .setValue(Math.round(this.plugin.settings.aliasCacheTtl / 60000))
                .setDynamicTooltip()
                .onChange((value) => {
                    this.plugin.settings.aliasCacheTtl = value * 60000;
                    cacheValue.setText(`${String(value)}m`);
                    void this.plugin.saveSettings();
                });
            if ('setInstant' in slider) {
                (slider as { setInstant(v: boolean): void }).setInstant(true);
            }
        });

        new Setting(containerEl)
            .setName('Clear resolution cache')
            .setDesc('Forced reset of the link and alias resolution index.')
            .addButton((btn) =>
                btn.setButtonText('Clear caches').onClick(() => {
                    this.plugin.quality.invalidateAliasCache();
                    this.plugin.engine.invalidateBacklinkIndex();
                    new Notice('Link and alias caches cleared.');
                }),
            );

        const bufferSetting = new Setting(containerEl)
            .setName('Log buffer size')
            .setDesc('Number of recent log entries kept in memory for export/debugging.');
        const bufferValue = bufferSetting.controlEl.createSpan({ cls: 'healer-slider-value' });
        bufferValue.setText(`${this.plugin.settings.logBufferSize}`);
        bufferValue.addClass('healer-ml-20');
        bufferValue.addClass('healer-font-weight-bold');

        bufferSetting.addSlider((slider) => {
            slider
                .setLimits(500, 5000, 100)
                .setValue(this.plugin.settings.logBufferSize)
                .setDynamicTooltip()
                .onChange((value) => {
                    this.plugin.settings.logBufferSize = value;
                    bufferValue.setText(`${String(value)}`);
                    void this.plugin.saveSettings();
                });
            if ('setInstant' in slider) {
                (slider as { setInstant(v: boolean): void }).setInstant(true);
            }
        });

        const timeoutSetting = new Setting(containerEl)
            .setName('Worker timeout')
            .setDesc('Seconds to wait for background analytical tasks (pagerank, community).');
        const timeoutValue = timeoutSetting.controlEl.createSpan({ cls: 'healer-slider-value' });
        timeoutValue.setText(`${this.plugin.settings.workerTimeout}s`);
        timeoutValue.addClass('healer-ml-20');
        timeoutValue.addClass('healer-font-weight-bold');

        timeoutSetting.addSlider((slider) => {
            slider
                .setLimits(30, 600, 30)
                .setValue(this.plugin.settings.workerTimeout)
                .setDynamicTooltip()
                .onChange((value) => {
                    this.plugin.settings.workerTimeout = value;
                    timeoutValue.setText(`${String(value)}s`);
                    void this.plugin.saveSettings();
                });
            if ('setInstant' in slider) {
                (slider as { setInstant(v: boolean): void }).setInstant(true);
            }
        });

        new Setting(containerEl)
            .setName('Reset all settings')
            .setDesc('Restore all settings to default values. This cannot be undone.')
            .addButton((button) => {
                button
                    .setButtonText('Factory reset')
                    .setWarning()
                    .onClick(async () => {
                        const confirmed = await new Promise<boolean>((resolve) => {
                            const modal = new Modal(this.app);
                            modal.titleEl.setText('Factory reset settings');
                            modal.contentEl.createEl('p', {
                                text: 'Restores all settings to defaults. Proceed?',
                            });
                            const buttonContainer = modal.contentEl.createDiv({ cls: 'healer-modal-buttons' });
                            this.setCssProps(buttonContainer, {
                                display: 'flex',
                                'justify-content': 'flex-end',
                                gap: '10px',
                                'margin-top': '20px',
                            });

                            let resolved = false;
                            const safeResolve = (val: boolean) => {
                                if (!resolved) {
                                    resolved = true;
                                    resolve(val);
                                }
                            };
                            modal.onClose = () => safeResolve(false);

                            new ButtonComponent(buttonContainer).setButtonText('Cancel').onClick(() => {
                                modal.close();
                                safeResolve(false);
                            });

                            new ButtonComponent(buttonContainer)
                                .setButtonText('Reset')
                                .setWarning()
                                .onClick(() => {
                                    modal.close();
                                    safeResolve(true);
                                });

                            modal.open();
                        });

                        if (confirmed) {
                            // Shallow merge preserving only core non-serializable info if needed, or simply assign default
                            this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
                            await this.plugin.saveSettings();
                            new Notice('Settings reset to factory defaults.');
                            this.display();
                        }
                    });
            });
    }

    async runModelDetection(button: ButtonComponent, isPrimary: boolean) {
        const endpoint = isPrimary ? this.plugin.settings.llmEndpoint : this.plugin.settings.secondaryLlmEndpoint;
        const apiKey = isPrimary ? await this.plugin.getApiKey('openai') : await this.plugin.getApiKey('anthropic');
        const cloudFallbacks = ['gpt-4o', 'claude-3-5-sonnet-latest', 'gemini-1.5-pro', 'deepseek-chat', 'o3-mini'];

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
            this.plugin.logger.error('Model detection failed', e);
            new Notice(`Detection failed. Check endpoint or firewall.`);
        } finally {
            button.setDisabled(false);
            button.setButtonText(isPrimary ? 'Scan primary' : 'Scan secondary');
        }
    }
}
