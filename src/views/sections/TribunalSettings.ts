import { Setting } from 'obsidian';
import type { SectionContext } from '../SectionContext';
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
        .setName('Safe zone threshold')
        .setDesc('Confidence level (1-100) above which the secondary model is skipped (uncertainty triage).')
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
        .setName('Healer trust rate structural weight')
        .setDesc(
            'Weight (0% to 100%) of structural graph metrics vs semantic vectors (vector-topological merging). Default > 50% prioritizes structure.',
        )
        .addSlider((slider) => {
            slider
                .setLimits(0, 100, 5)
                .setValue((plugin.settings.htrStructuralWeight ?? 0.6) * 100)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    plugin.settings.htrStructuralWeight = value / 100;
                    await plugin.saveSettings();
                });
        });
}
