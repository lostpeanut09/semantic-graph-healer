import { Setting } from 'obsidian';
import type { SectionContext } from '../SectionContext';

export function renderDeepAnalyticsSettings(containerEl: HTMLElement, ctx: SectionContext) {
    const { plugin } = ctx;

    const createHeader = (title: string, desc: string) => {
        const setting = new Setting(containerEl).setHeading().setName(title).setDesc(desc);
        setting.settingEl.addClass('healer-category-header');
        return setting.settingEl;
    };

    // --- 5. Deep analytics ---
    createHeader('Graph metrics', 'Advanced graph analysis');

    new Setting(containerEl)
        .setName('Enable deep graph analysis')
        .setDesc('Run analytical metrics to find pillars and clusters')
        .addToggle((toggle) =>
            toggle.setValue(plugin.settings.enableDeepGraphAnalysis).onChange((value) => {
                plugin.settings.enableDeepGraphAnalysis = value;
                void plugin.saveSettings();
            }),
        );
}
