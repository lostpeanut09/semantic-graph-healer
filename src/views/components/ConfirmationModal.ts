import { App, Modal, ButtonComponent } from 'obsidian';
import { Suggestion } from '../../types';

export class ConfirmationModal extends Modal {
    constructor(
        app: App,
        private suggestion: Suggestion,
        private onConfirm: () => void
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Confirm Complex Execution' });
        contentEl.createEl('p', { 
            text: 'This action involves editing multiple files to repair a topological bridge gap. Please confirm the changes below.' 
        });

        const list = contentEl.createEl('ul');
        const meta = this.suggestion.meta;
        if (meta) {
            if (meta.sourcePath) {
                list.createEl('li', { text: `Update: ${meta.sourcePath} (setting ${meta.property || 'next'})` });
            }
            if (meta.targetPath) {
                const invProp = meta.property === 'next' ? 'prev' : 'next';
                list.createEl('li', { text: `Update: ${meta.targetPath} (setting ${invProp} and ${meta.property || 'next'})` });
            }
            if (meta.winner) {
                const invProp = meta.property === 'next' ? 'prev' : 'next';
                list.createEl('li', { text: `Update: ${meta.winner} (setting ${invProp})` });
            }
        }

        const btnRow = contentEl.createDiv({ 
            cls: 'healer-modal-buttons', 
            attr: { style: 'display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px;' } 
        });
        
        new ButtonComponent(btnRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());

        new ButtonComponent(btnRow)
            .setButtonText('Confirm Execution')
            .setCta()
            .onClick(() => {
                this.onConfirm();
                this.close();
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
