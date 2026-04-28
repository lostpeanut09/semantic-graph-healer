import { Setting } from 'obsidian';
import type { SectionContext } from '../SectionContext';

export function renderIntelligentEvolutionSettings(containerEl: HTMLElement, ctx: SectionContext) {
    const { plugin, refresh } = ctx;

    const createHeader = (title: string, desc: string) => {
        const setting = new Setting(containerEl).setHeading().setName(title).setDesc(desc);
        setting.settingEl.addClass('healer-category-header');
        return setting.settingEl;
    };

    // --- 7. Intelligent evolution ---
    createHeader('Intelligent evolution', 'Dynamic MOC management and aesthetics for complex vaults.');

    new Setting(containerEl)
        .setName('Enable temporal analysis')
        .setDesc('Validate topological edges against "chronos_date" properties to prevent chronological paradoxes.')
        .addToggle((toggle) =>
            toggle.setValue(plugin.settings.enableTemporalAnalysis).onChange((value) => {
                plugin.settings.enableTemporalAnalysis = value;
                void plugin.saveSettings();
            }),
        );

    new Setting(containerEl)
        .setName('Enable dynamic ontology evolution')
        .setDesc('Suggest the creation of new maps of content when folder saturation exceeds thresholds.')
        .addToggle((toggle) =>
            toggle.setValue(plugin.settings.enableDynamicOntologyEvolution).onChange((value) => {
                plugin.settings.enableDynamicOntologyEvolution = value;
                void (async () => {
                    await plugin.saveSettings();
                    refresh(); // Show/hide threshold slider
                })();
            }),
        );

    if (plugin.settings.enableDynamicOntologyEvolution) {
        const mocSetting = new Setting(containerEl)
            .setName('Moc saturation threshold')
            .setDesc('Number of child links after which sub-categories are suggested.');
        const mocValue = mocSetting.controlEl.createSpan({
            cls: 'healer-slider-value',
        });
        mocValue.setText(`${plugin.settings.mocSaturationThreshold}`);
        mocValue.addClass('healer-ml-20');
        mocValue.addClass('healer-font-weight-bold');

        mocSetting.addSlider((slider) => {
            slider
                .setLimits(5, 100, 1)
                .setValue(plugin.settings.mocSaturationThreshold)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.mocSaturationThreshold = value;
                    mocValue.setText(`${String(value)}`);
                    void plugin.saveSettings();
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
            toggle.setValue(plugin.settings.enableTagHierarchySync).onChange((value) => {
                plugin.settings.enableTagHierarchySync = value;
                void plugin.saveSettings();
            }),
        );

    const aestheticSetting = new Setting(containerEl)
        .setName('Aesthetic rules (JSON)')
        .setDesc('Define node colors and stickers based on metadata properties. Must be valid JSON.');
    aestheticSetting.settingEl.addClass('healer-block-setting');
    let aestheticDebounce: number;
    aestheticSetting.addTextArea((text) => {
        text.setValue(plugin.settings.aestheticPresetRules);
        text.inputEl.rows = 8;
        text.inputEl.addClass('healer-json-textarea');
        text.onChange((value) => {
            if (aestheticDebounce) window.clearTimeout(aestheticDebounce);
            aestheticDebounce = window.setTimeout(() => {
                void (async () => {
                    try {
                        JSON.parse(value);
                        plugin.settings.aestheticPresetRules = value;
                        await plugin.saveSettings();
                        text.inputEl.removeClass('healer-border-error');
                    } catch {
                        text.inputEl.addClass('healer-border-error');
                    }
                })();
            }, 1000);
        });
    });
}
