import { Setting } from 'obsidian';
import type { SectionContext } from '../SectionContext';

/**
 * Renders the Performance & Safety settings section.
 * (Phase 12 Wave 2)
 */
export function renderPerformanceSafetySettings(containerEl: HTMLElement, ctx: SectionContext) {
    const { plugin } = ctx;

    const createHeader = (title: string, desc: string) => {
        const setting = new Setting(containerEl).setHeading().setName(title).setDesc(desc);
        setting.settingEl.addClass('healer-category-header');
        return setting.settingEl;
    };

    createHeader('Performance & Safety', 'Proactively manage resource consumption in large vaults.');

    new Setting(containerEl)
        .setName('Enable safety mode')
        .setDesc('Automatically restricts intensive operations in large vaults or on mobile devices.')
        .addToggle((toggle) =>
            toggle.setValue(plugin.settings.enableSafetyMode).onChange(async (value) => {
                plugin.settings.enableSafetyMode = value;
                await plugin.saveSettings();
                plugin.performanceService.reEvaluate();
                ctx.refresh(); // Refresh to show updated mode
            }),
        );

    new Setting(containerEl)
        .setName('Desktop note threshold')
        .setDesc('Safety mode activates on desktop when notes exceed this number.')
        .addText((text) =>
            text
                .setPlaceholder('10000')
                .setValue(String(plugin.settings.safetyModeThresholdDesktop))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num)) {
                        plugin.settings.safetyModeThresholdDesktop = num;
                        await plugin.saveSettings();
                        plugin.performanceService.reEvaluate();
                    }
                }),
        );

    new Setting(containerEl)
        .setName('Mobile note threshold')
        .setDesc('Safety mode activates on mobile when notes exceed this number.')
        .addText((text) =>
            text
                .setPlaceholder('2500')
                .setValue(String(plugin.settings.safetyModeThresholdMobile))
                .onChange(async (value) => {
                    const num = parseInt(value);
                    if (!isNaN(num)) {
                        plugin.settings.safetyModeThresholdMobile = num;
                        await plugin.saveSettings();
                        plugin.performanceService.reEvaluate();
                    }
                }),
        );

    // Current Status info
    const currentMode = plugin.performanceService.performanceMode;
    new Setting(containerEl)
        .setName('Current performance mode')
        .setDesc(`The plugin is currently operating in ${currentMode} mode.`);
}
