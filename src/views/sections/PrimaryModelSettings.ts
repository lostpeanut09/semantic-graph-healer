import { Setting } from 'obsidian';
import type { SectionContext } from '../SectionContext';
import { getProviderFromEndpoint } from '../../core/HealerUtils';

export function renderPrimaryModelSettings(containerEl: HTMLElement, ctx: SectionContext) {
    const { plugin, refresh, runModelDetection } = ctx;

    const createHeader = (title: string, desc: string) => {
        const setting = new Setting(containerEl).setHeading().setName(title).setDesc(desc);
        setting.settingEl.addClass('healer-category-header');
        return setting.settingEl;
    };

    // --- 6. Multi-provider LLM ---
    createHeader(
        'Primary model configuration',
        'Main intelligence engine. Note: only local models (e.g. Ollama) are free — cloud providers charge per token. Check your provider.',
    );

    if (!plugin.settings.detectedModels || plugin.settings.detectedModels.length === 0) {
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
                .setValue(plugin.settings.llmEndpoint)
                .onChange((value) => {
                    plugin.settings.llmEndpoint = value;
                    void plugin.saveSettings();
                }),
        );

    new Setting(containerEl)
        .setName('Model key')
        .setDesc(
            'Securely stored key for the model. For local models, enter "sk-local". For cloud apis, enter the real key.',
        )
        .addText((text) => {
            text.setPlaceholder('Enter key...').setValue(plugin.settings.llmApiKey);
            text.inputEl.type = 'password';
            text.onChange(async (value) => {
                if (value === 'sk-local' || value === '') {
                    plugin.settings.llmApiKey = value;
                    await plugin.saveSettings();
                } else {
                    const provider = getProviderFromEndpoint(plugin.settings.llmEndpoint);
                    await plugin.keychainService.setApiKey(provider, value);
                    plugin.settings.llmApiKey = '';
                    await plugin.saveSettings();
                }
            });
        });

    new Setting(containerEl)
        .setName('Primary model selection')
        .setDesc('Select the target model from the detected choices on your primary endpoint.')
        .addDropdown((dropdown) => {
            (plugin.settings.detectedModels || []).forEach((m: string) => {
                dropdown.addOption(m, m);
            });
            dropdown.setValue(plugin.settings.primaryModel || plugin.settings.llmModelName).onChange((value) => {
                plugin.settings.primaryModel = value;
                plugin.settings.llmModelName = value;
                void (async () => {
                    await plugin.saveSettings();
                    refresh(); // Refresh to update diversity check
                })();
            });
        });

    new Setting(containerEl)
        .setName('Detect primary models')
        .setDesc('Scan the primary endpoint for available models.')
        .addButton((btn) => btn.setButtonText('Scan primary').onClick(async () => await runModelDetection(btn, true)));

    // --- Secondary Model ---
    createHeader('Secondary model configuration', 'Secondary intelligence engine used for the Verification Tribunal.');

    new Setting(containerEl)
        .setName('Secondary endpoint address')
        .setDesc('Independent server for the secondary model verification.')
        .addText((text) =>
            text.setValue(plugin.settings.secondaryLlmEndpoint).onChange((value) => {
                plugin.settings.secondaryLlmEndpoint = value;
                void plugin.saveSettings();
            }),
        );

    new Setting(containerEl)
        .setName('Secondary model key')
        .setDesc(
            'Secure key for the verification endpoint. For local models, enter "sk-local". For cloud apis, enter the real key.',
        )
        .addText((text) => {
            text.setPlaceholder('Enter key...').setValue(plugin.settings.secondaryLlmApiKey);
            text.inputEl.type = 'password';
            text.onChange(async (value) => {
                if (value === 'sk-local' || value === '') {
                    plugin.settings.secondaryLlmApiKey = value;
                    await plugin.saveSettings();
                } else {
                    const provider = getProviderFromEndpoint(plugin.settings.secondaryLlmEndpoint);
                    await plugin.keychainService.setApiKey(provider, value);
                    plugin.settings.secondaryLlmApiKey = '';
                    await plugin.saveSettings();
                }
            });
        });

    new Setting(containerEl)
        .setName('Secondary model selection')
        .setDesc('Select the target verification model explicitly.')
        .addDropdown((dropdown) => {
            const models = plugin.settings.secondaryDetectedModels || [];
            models.forEach((m: string) => {
                dropdown.addOption(m, m);
            });
            dropdown
                .setValue(plugin.settings.secondaryModel || plugin.settings.secondaryLlmModelName)
                .onChange((value) => {
                    plugin.settings.secondaryModel = value;
                    plugin.settings.secondaryLlmModelName = value;
                    void (async () => {
                        await plugin.saveSettings();
                        refresh(); // Refresh to update diversity check
                    })();
                });
        });

    new Setting(containerEl)
        .setName('Detect secondary models')
        .setDesc('Scan the provided secondary endpoint for verification models.')
        .addButton((btn) =>
            btn.setButtonText('Scan secondary').onClick(async () => await ctx.runModelDetection(btn, false)),
        );
}
