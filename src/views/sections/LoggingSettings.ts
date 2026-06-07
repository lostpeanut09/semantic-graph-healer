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

    createHeader('Deduplication and rate limit', 'Prevent log spam from rapid-fire or repeated errors.');

    // Upper bound for the dedup window (24h) — prevents accidental "Infinity" / huge values.
    const MAX_DEDUP_WINDOW_MS = 86_400_000;
    // Upper bound for caps (10k) — generous headroom for noisy workloads.
    const MAX_LOG_CAP = 10_000;

    const sanitizeBoundedInt = (raw: string, max: number): number => {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return 0;
        return Math.max(0, Math.min(max, Math.floor(parsed)));
    };

    new Setting(containerEl)
        .setName('Duplicate suppression window (ms)')
        .setDesc('Time window during which identical (level + module + message) log calls are collapsed into one.')
        .addText((text) => {
            text.setPlaceholder('5000')
                .setValue(String(plugin.settings.logDedupWindowMs))
                .onChange(async (value) => {
                    const n = sanitizeBoundedInt(value, MAX_DEDUP_WINDOW_MS);
                    if (!Number.isFinite(Number(value)) && value.trim() !== '') {
                        new Notice(`Invalid value "${value}". Using 0.`);
                    } else if (n === 0 && value.trim() !== '' && Number(value) === 0) {
                        new Notice('Duplicate suppression disabled (value set to 0).');
                    }
                    plugin.settings.logDedupWindowMs = n;
                    await plugin.saveSettings();
                    plugin.logger.setDedupConfig({ windowMs: n });
                });
        });

    new Setting(containerEl)
        .setName('Max logs per module per window')
        .setDesc('Upper bound on log calls accepted from a single module within the window.')
        .addText((text) => {
            text.setPlaceholder('10')
                .setValue(String(plugin.settings.logPerModuleCap))
                .onChange(async (value) => {
                    const n = sanitizeBoundedInt(value, MAX_LOG_CAP);
                    if (n === 0 && value.trim() !== '' && Number(value) === 0) {
                        new Notice('Per-module rate cap disabled (value set to 0).');
                    }
                    plugin.settings.logPerModuleCap = n;
                    await plugin.saveSettings();
                    plugin.logger.setDedupConfig({ perModuleCap: n });
                });
        });

    new Setting(containerEl)
        .setName('Max logs globally per window')
        .setDesc('Upper bound on log calls accepted from all modules within the window.')
        .addText((text) => {
            text.setPlaceholder('100')
                .setValue(String(plugin.settings.logGlobalCap))
                .onChange(async (value) => {
                    const n = sanitizeBoundedInt(value, MAX_LOG_CAP);
                    if (n === 0 && value.trim() !== '' && Number(value) === 0) {
                        new Notice('Global rate cap disabled (value set to 0).');
                    }
                    plugin.settings.logGlobalCap = n;
                    await plugin.saveSettings();
                    plugin.logger.setDedupConfig({ globalCap: n });
                });
        });
}
