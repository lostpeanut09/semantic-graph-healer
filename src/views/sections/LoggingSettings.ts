import { Setting, Notice } from 'obsidian';
import type { SectionContext } from '../SectionContext';
export function renderLoggingSettings(containerEl: HTMLElement, ctx: SectionContext) {
    const { plugin } = ctx;

    const createHeader = (title: string, desc: string) => {
        const setting = new Setting(containerEl).setHeading().setName(title).setDesc(desc);
        setting.settingEl.addClass('healer-category-header');
        return setting.settingEl;
    };

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
                .setValue(plugin.settings.logLevel)
                .onChange(async (value: 'debug' | 'info' | 'warn' | 'error') => {
                    plugin.settings.logLevel = value;
                    await plugin.saveSettings();
                    plugin.logger.setLevel(value);
                });
        });

    new Setting(containerEl)
        .setName('Persistence')
        .setDesc('Write logs to a dedicated file in the vault.')
        .addToggle((toggle) =>
            toggle.setValue(plugin.settings.enableFileLogging).onChange(async (value) => {
                plugin.settings.enableFileLogging = value;
                await plugin.saveSettings();
                plugin.logger.setFileLogging(value);
            }),
        );

    new Setting(containerEl)
        .setName('Archive logs')
        .setDesc('Generate a Markdown diagnostic report.')
        .addButton((btn) =>
            btn.setButtonText('Export log').onClick(async () => {
                const logs = plugin.logger.exportLogs();
                const stats = plugin.logger.getStats();
                const content = `# Diagnostic Report: Semantic Graph Healer\n- Generated: ${new Date().toISOString()}\n- Total Entries: ${stats.total}\n\n\`\`\`\n${logs}\n\`\`\``;
                const path = `plugins/${plugin.manifest.id}/diagnostic-export.md`;
                await plugin.app.vault.create(path, content);
                new Notice(`Exported to ${path}`);
            }),
        );
}
