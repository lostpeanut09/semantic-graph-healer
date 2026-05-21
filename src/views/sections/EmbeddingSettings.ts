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
        'Embeddings & Semantic GraphRAG',
        'Local-first vector search and community-centric retrieval. Enables deep semantic vault queries.'
    );

    new Setting(containerEl)
        .setName('Embedding provider')
        .setDesc('Select the backend for generating vector embeddings.')
        .addDropdown((dropdown) => {
            dropdown
                .addOption('ollama', 'Ollama (Local)')
                .addOption('localai', 'LocalAI (Local)')
                .addOption('openai', 'OpenAI (Cloud)')
                .setValue(plugin.settings.embeddingProvider)
                .onChange(async (value: 'ollama' | 'localai' | 'openai') => {
                    plugin.settings.embeddingProvider = value;
                    await plugin.saveSettings();
                    refresh();
                });
        });

    new Setting(containerEl)
        .setName('Embedding endpoint')
        .setDesc('Server address for generating embeddings.')
        .addText((text) =>
            text
                .setPlaceholder('e.g. http://localhost:11434')
                .setValue(plugin.settings.embeddingEndpoint)
                .onChange(async (value) => {
                    plugin.settings.embeddingEndpoint = value;
                    await plugin.saveSettings();
                })
        );

    new Setting(containerEl)
        .setName('Embedding model')
        .setDesc('Model name used for embeddings (e.g. nomic-embed-text).')
        .addText((text) =>
            text
                .setPlaceholder('e.g. nomic-embed-text')
                .setValue(plugin.settings.embeddingModel)
                .onChange(async (value) => {
                    plugin.settings.embeddingModel = value;
                    await plugin.saveSettings();
                })
        );

    new Setting(containerEl)
        .setName('Check model alignment')
        .setDesc('Run Semantic Anchor check to verify model quality and dimensions.')
        .addButton((btn) =>
            btn.setButtonText('Verify Model').onClick(async () => {
                btn.setDisabled(true);
                btn.setButtonText('Verifying...');
                try {
                    const ok = await plugin.embedding.checkModelAlignment();
                    if (ok) {
                        new Notice('Model check passed: Stable alignment.');
                    } else {
                        new Notice('Model check failed: Semantic misalignment or offline.');
                    }
                } catch (e) {
                    new Notice('Verification failed. Check console.');
                } finally {
                    btn.setDisabled(false);
                    btn.setButtonText('Verify Model');
                    refresh();
                }
            })
        );

    const status = plugin.embedding.modelStatus;
    const statusColor = status === 'STABLE' ? 'var(--text-success)' : status === 'MISALIGNED' ? 'var(--text-warning)' : 'var(--text-error)';
    
    containerEl.createDiv({
        cls: 'healer-model-status',
        text: `Status: ${status}`
    }).style.color = statusColor;

    new Setting(containerEl)
        .setName('Generate GraphRAG index')
        .setDesc('Build community themes and entity indices. Required for GraphRAG queries.')
        .addButton((btn) =>
            btn.setButtonText('Rebuild Index').onClick(async () => {
                btn.setDisabled(true);
                btn.setButtonText('Indexing...');
                new Notice('Starting background indexing...');
                try {
                    await plugin.graphRag.indexCommunities();
                    new Notice('Community indexing complete.');
                } catch (e) {
                    new Notice('Indexing failed.');
                } finally {
                    btn.setDisabled(false);
                    btn.setButtonText('Rebuild Index');
                }
            })
        );
}
