import { Setting, Notice } from 'obsidian';
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

    createHeader('Link prediction weights', 'Balance indices for semantic link prediction');

    new Setting(containerEl)
        .setName('Jaccard index weight')
        .setDesc('Common neighbors / total neighbors')
        .addSlider((slider) =>
            slider
                .setLimits(0, 1, 0.05)
                .setValue(plugin.settings.linkPredictionWeights.jaccard)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.linkPredictionWeights.jaccard = value;
                    void plugin.saveSettings();
                }),
        );

    new Setting(containerEl)
        .setName('Adamic-adar weight')
        .setDesc('Penalizes high-degree common neighbors')
        .addSlider((slider) =>
            slider
                .setLimits(0, 1, 0.05)
                .setValue(plugin.settings.linkPredictionWeights.adamicAdar)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.linkPredictionWeights.adamicAdar = value;
                    void plugin.saveSettings();
                }),
        );

    new Setting(containerEl)
        .setName('Resource allocation weight')
        .setDesc('Stricter neighbor penalty than adamic-adar.')
        .addSlider((slider) =>
            slider
                .setLimits(0, 1, 0.05)
                .setValue(plugin.settings.linkPredictionWeights.resourceAllocation)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.linkPredictionWeights.resourceAllocation = value;
                    void plugin.saveSettings();
                }),
        );

    createHeader('Topological thresholds', 'Fine-tune diagnostic sensitivity');

    new Setting(containerEl)
        .setName('Map of content saturation threshold')
        .setDesc('Minimum links before a node is considered a map of content candidate.')
        .addSlider((slider) =>
            slider
                .setLimits(5, 50, 1)
                .setValue(plugin.settings.mocSaturationThreshold)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.mocSaturationThreshold = value;
                    void plugin.saveSettings();
                }),
        );

    new Setting(containerEl)
        .setName('Black hole threshold')
        .setDesc('Minimum in-degree (incoming links) to flag a note with zero out-links as a "black hole".')
        .addSlider((slider) =>
            slider
                .setLimits(3, 20, 1)
                .setValue(plugin.settings.blackHoleThreshold)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.blackHoleThreshold = value;
                    void plugin.saveSettings();
                }),
        );

    new Setting(containerEl)
        .setName('Bridge scrutiny max depth')
        .setDesc('Maximum transitive distance to search for missing bridge links.')
        .addSlider((slider) =>
            slider
                .setLimits(1, 5, 1)
                .setValue(plugin.settings.bridgeScrutinyMaxDepth)
                .setDynamicTooltip()
                .onChange((value) => {
                    plugin.settings.bridgeScrutinyMaxDepth = value;
                    void plugin.saveSettings();
                }),
        );

    new Setting(containerEl)
        .setName('Maintenance')
        .setDesc('Clear persisted analytical scores and force re-analysis.')
        .addButton((button) =>
            button
                .setButtonText('Clear analytical cache')
                .setWarning()
                .onClick(() => {
                    plugin.cache.topologicalScores = {
                        pageRank: {},
                        betweenness: {},
                        communities: {},
                        lastAnalysisTimestamp: 0,
                        graphVersion: '',
                    };
                    plugin.cache.save();
                    new Notice('Topological cache cleared.');
                }),
        );
}
