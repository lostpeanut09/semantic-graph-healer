import { Setting, Notice } from 'obsidian';
import type { SectionContext } from '../SectionContext';

export function renderEmbeddingSettings(containerEl: HTMLElement, ctx: SectionContext) {
    const { plugin, refresh } = ctx;

    const createHeader = (title: string, desc: string) => {
        const setting = new Setting(containerEl).setHeading().setName(title).setDesc(desc);
        setting.settingEl.addClass('healer-category-header');
        return setting.settingEl;
    };

    createHeader(
        'Embeddings and semantic graphrag',
        'Local-first vector search and community-centric retrieval. Enables deep semantic vault queries.',
    );

    new Setting(containerEl)
        .setName('Embedding provider')
        .setDesc('Select the backend for generating vector embeddings')
        .addDropdown((dropdown) => {
            dropdown
                .addOption('ollama', 'Ollama (local)')
                .addOption('localai', 'Localai (local)')
                .addOption('openai', 'Openai (cloud)')
                .setValue(plugin.settings.embeddingProvider)
                .onChange(async (value: 'ollama' | 'localai' | 'openai') => {
                    plugin.settings.embeddingProvider = value;
                    await plugin.saveSettings();
                    refresh();
                });
        });

    new Setting(containerEl)
        .setName('Embedding endpoint')
        .setDesc('Server address for generating embeddings')
        .addText((text) =>
            text
                .setPlaceholder('E.g. http://localhost:11434')
                .setValue(plugin.settings.embeddingEndpoint)
                .onChange(async (value) => {
                    plugin.settings.embeddingEndpoint = value;
                    await plugin.saveSettings();
                }),
        );

    new Setting(containerEl)
        .setName('Embedding model')
        .setDesc('Model name used for embeddings')
        .addText((text) =>
            text
                .setPlaceholder('E.g. Nomic-embed-text')
                .setValue(plugin.settings.embeddingModel)
                .onChange(async (value) => {
                    plugin.settings.embeddingModel = value;
                    await plugin.saveSettings();
                }),
        );

    new Setting(containerEl)
        .setName('Check model alignment')
        .setDesc('Run semantic anchor check to verify model quality and dimensions')
        .addButton((btn) =>
            btn.setButtonText('Verify model').onClick(async () => {
                btn.setDisabled(true);
                btn.setButtonText('Verifying');
                btn.buttonEl.setAttribute('aria-busy', 'true');
                try {
                    const ok = await plugin.embedding.checkModelAlignment();
                    if (ok) {
                        new Notice('Model check passed');
                    } else {
                        new Notice('Model check failed');
                    }
                } catch {
                    new Notice('Verification failed');
                } finally {
                    btn.buttonEl.removeAttribute('aria-busy');
                    btn.setDisabled(false);
                    btn.setButtonText('Verify model');
                    refresh();
                }
            }),
        );

    const status = plugin.embedding.modelStatus;
    const statusColor =
        status === 'STABLE'
            ? 'var(--text-success)'
            : status === 'MISALIGNED'
              ? 'var(--text-warning)'
              : 'var(--text-error)';

    containerEl.createDiv({
        cls: 'healer-model-status',
        text: `Status: ${status}`,
    }).style.color = statusColor;

    new Setting(containerEl)
        .setName('Generate graphrag index')
        .setDesc('Build community themes and entity indices. Required for graphrag queries.')
        .addButton((btn) =>
            btn.setButtonText('Rebuild').onClick(async () => {
                btn.setDisabled(true);
                btn.setButtonText('Indexing');
                btn.buttonEl.setAttribute('aria-busy', 'true');
                new Notice('Starting background indexing');
                try {
                    await plugin.graphRag.indexCommunities();
                    new Notice('Community indexing complete');
                } catch {
                    new Notice('Indexing failed');
                } finally {
                    btn.buttonEl.removeAttribute('aria-busy');
                    btn.setDisabled(false);
                    btn.setButtonText('Rebuild');
                }
            }),
        );
}
