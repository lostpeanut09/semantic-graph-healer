import { Setting } from 'obsidian';
import type { SectionContext } from '../SectionContext';
import { isObsidianInternalApp } from '../../core/HealerUtils';
export function renderTribunalSettings(containerEl: HTMLElement, ctx: SectionContext) {
    const { plugin, refresh } = ctx;

    const createHeader = (title: string, desc: string) => {
        const setting = new Setting(containerEl).setHeading().setName(title).setDesc(desc);
        setting.settingEl.addClass('healer-category-header');
        return setting.settingEl;
    };

    // --- 7. The AI tribunal ---
    createHeader('Verification engine', 'Secondary model for consensus. Uses additional tokens.');

    new Setting(containerEl)
        .setName('Enable verification')
        .setDesc('If enabled, all suggestions must be confirmed by a secondary independent model.')
        .addToggle((toggle) =>
            toggle.setValue(plugin.settings.enableAiTribunal).onChange((value) => {
                plugin.settings.enableAiTribunal = value;
                void (async () => {
                    await plugin.saveSettings();
                    refresh(); // Refresh to show diversity warning
                })();
            }),
        );

    if (plugin.settings.enableAiTribunal) {
        const isRedundant =
            plugin.settings.primaryModel === plugin.settings.secondaryModel &&
            plugin.settings.llmEndpoint === plugin.settings.secondaryLlmEndpoint;

        if (isRedundant) {
            containerEl.createEl('div', {
                text: 'Primary and secondary providers are identical. The tribunal will be bypassed to save tokens.',
                cls: 'healer-warning-banner',
            });
        }
    }

    new Setting(containerEl)
        .setName('Safe Zone threshold')
        .setDesc('Confidence level (1-100) above which the secondary model is skipped (Uncertainty Triage).')
        .addSlider((slider) => {
            slider
                .setLimits(1, 100, 1)
                .setValue(plugin.settings.safeZoneThreshold)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    plugin.settings.safeZoneThreshold = value;
                    await plugin.saveSettings();
                });
        });

    new Setting(containerEl)
        .setName('HTR structural weight')
        .setDesc(
            'Weight (0.0 to 1.0) of structural graph metrics vs semantic vectors (Vector-Topological Merging). Default > 0.5 prioritizes structure.',
        )
        .addSlider((slider) => {
            slider
                .setLimits(0.0, 1.0, 0.05)
                .setValue(plugin.settings.htrStructuralWeight)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    plugin.settings.htrStructuralWeight = value;
                    await plugin.saveSettings();
                });
        });
}
