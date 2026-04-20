import { App, PluginSettingTab, Notice } from 'obsidian';
import type { ButtonComponent } from 'obsidian';
import type SemanticGraphHealer from '../main';
import type { SectionContext } from './SectionContext';
import type { ExtendedApp } from '../types';

// Import section renderers
import { renderCoreSettings } from './sections/CoreSettings';
import { renderIntegrationsSettings } from './sections/IntegrationsSettings';
import { renderHierarchiesSettings } from './sections/HierarchiesSettings';
import { renderRulesSettings } from './sections/RulesSettings';
import { renderDeepAnalyticsSettings } from './sections/DeepAnalyticsSettings';
import { renderPrimaryModelSettings } from './sections/PrimaryModelSettings';
import { renderResilienceSettings } from './sections/ResilienceSettings';
import { renderTribunalSettings } from './sections/TribunalSettings';
import { renderSharedParamsSettings } from './sections/SharedParamsSettings';
import { renderIntelligentEvolutionSettings } from './sections/IntelligentEvolutionSettings';
import { renderExperimentalSettings } from './sections/ExperimentalSettings';
import { renderSyncIntegrationSettings } from './sections/SyncIntegrationSettings';
import { renderPhase3InferenceSettings } from './sections/Phase3InferenceSettings';
import { renderInfranodusSettings } from './sections/InfranodusSettings';
import { renderSecurityApiKeysSettings } from './sections/SecurityApiKeysSettings';
import { renderLoggingSettings } from './sections/LoggingSettings';
import { renderExhaustedNotesSettings } from './sections/ExhaustedNotesSettings';
import { renderBlacklistSettings } from './sections/BlacklistSettings';
import { renderSettingsProfilesSettings } from './sections/SettingsProfilesSettings';
import { renderAdvancedMaintenanceSettings } from './sections/AdvancedMaintenanceSettings';

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
        const manifest = this.plugin.manifest as typeof this.plugin.manifest & {
            dir?: string;
        };
        const dir = manifest.dir ?? `plugins/${manifest.id}`;
        const bannerPath = this.app.vault.adapter.getResourcePath(`${dir}/assets/banner.png`);
        const bannerEl = containerEl.createEl('img');
        bannerEl.src = bannerPath;
        bannerEl.addClass('healer-settings-banner');

        // Build shared context for section renderers
        const ctx: SectionContext = {
            plugin: this.plugin,
            app: this.app as ExtendedApp,
            setCssProps: (el, props) => this.setCssProps(el, props),
            refresh: () => this.display(),
            runModelDetection: (button, isPrimary) => this.runModelDetection(button, isPrimary),
        };

        // Render each section in order
        renderCoreSettings(containerEl, ctx);
        renderIntegrationsSettings(containerEl, ctx);
        renderHierarchiesSettings(containerEl, ctx);
        renderRulesSettings(containerEl, ctx);
        renderDeepAnalyticsSettings(containerEl, ctx);
        renderPrimaryModelSettings(containerEl, ctx);
        renderResilienceSettings(containerEl, ctx);
        renderTribunalSettings(containerEl, ctx);
        renderSharedParamsSettings(containerEl, ctx);
        renderIntelligentEvolutionSettings(containerEl, ctx);
        renderExperimentalSettings(containerEl, ctx);
        renderSyncIntegrationSettings(containerEl, ctx);
        renderPhase3InferenceSettings(containerEl, ctx);
        renderInfranodusSettings(containerEl, ctx);
        renderSecurityApiKeysSettings(containerEl, ctx);
        renderLoggingSettings(containerEl, ctx);
        renderExhaustedNotesSettings(containerEl, ctx);
        renderBlacklistSettings(containerEl, ctx);
        renderSettingsProfilesSettings(containerEl, ctx);
        renderAdvancedMaintenanceSettings(containerEl, ctx);
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
            new Notice('Detection failed. Check endpoint or firewall.');
        } finally {
            button.setDisabled(false);
            button.setButtonText(isPrimary ? 'Scan primary' : 'Scan secondary');
        }
    }
}
