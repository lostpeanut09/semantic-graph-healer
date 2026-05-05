import { Setting } from 'obsidian';
import type { SectionContext } from '../SectionContext';

export function renderIntegrationsSettings(containerEl: HTMLElement, ctx: SectionContext) {
    const { plugin, refresh } = ctx;

    const createHeader = (title: string, desc: string) => {
        const setting = new Setting(containerEl).setHeading().setName(title).setDesc(desc);
        setting.settingEl.addClass('healer-category-header');
        return setting.settingEl;
    };

    // --- 2. INTEGRATIONS ---
    createHeader('Integrations', 'Connect with other plugins for enhanced intelligence.');

    new Setting(containerEl)
        .setName('Smart connections integration')
        .setDesc('Use smart connections embeddings to find semantically related nodes during discovery.')
        .addToggle((toggle) =>
            toggle.setValue(plugin.settings.enableSmartConnections).onChange((value) => {
                plugin.settings.enableSmartConnections = value;
                void (async () => {
                    await plugin.saveSettings();
                    refresh(); // Refresh to show/hide limit
                })();
            }),
        );

    if (plugin.settings.enableSmartConnections) {
        new Setting(containerEl)
            .setName('Smart connections limit')
            .setDesc('Number of semantic neighbors to retrieve.')
            .addSlider((slider) => {
                slider
                    .setLimits(1, 20, 1)
                    .setValue(plugin.settings.smartConnectionsLimit)
                    .setDynamicTooltip()
                    .onChange((value) => {
                        plugin.settings.smartConnectionsLimit = value;
                        void plugin.saveSettings();
                    });
                if ('setInstant' in slider) {
                    (slider as { setInstant(v: boolean): void }).setInstant(true);
                }
            });

        new Setting(containerEl)
            .setName('AJSON size cap (Bytes)')
            .setDesc('Skip deep fallback parsing for index files exceeding this size (default 1MB).')
            .addText((text) =>
                text
                    .setPlaceholder('1048576')
                    .setValue(String(plugin.settings.smartConnectionsAjsonSizeCap))
                    .onChange((value) => {
                        const num = parseInt(value);
                        if (!isNaN(num)) {
                            plugin.settings.smartConnectionsAjsonSizeCap = num;
                            void plugin.saveSettings();
                        }
                    }),
            );
    }

    new Setting(containerEl)
        .setName('Include non-markdown hubs')
        .setDesc('Include Canvas, Excalidraw, and other searchable formats in graph extraction.')
        .addToggle((toggle) =>
            toggle.setValue(plugin.settings.includeNonMarkdownHubs).onChange((value) => {
                plugin.settings.includeNonMarkdownHubs = value;
                void plugin.saveSettings();
            }),
        );
}
