import { Modal, Setting, Notice } from 'obsidian';
import type { KeychainService } from '../../core/services/KeychainService';
import type { ExtendedApp } from '../../types';

export class ResetKeychainModal extends Modal {
    constructor(
        app: ExtendedApp,
        private keychainService: KeychainService,
    ) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Keychain security reset' });
        contentEl.createEl('p', {
            text: 'It appears your encryption master key has been lost or corrupted. This can happen if the vault-local secret storage was cleared or if you are syncing to a new device without a transferred master key.',
        });
        contentEl.createEl('p', {
            text: 'To restore functionality, you must reset the keychain. This will generate a new master key. You will then need to re-enter your API keys in the settings.',
            cls: 'mod-warning',
        });

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText('Reset and re-enter API keys')
                    .setWarning()
                    .onClick(async () => {
                        await this.keychainService.resetKeychain();
                        new Notice('Keychain has been reset. Please re-enter your API keys in the settings.');
                        this.close();
                    }),
            )
            .addButton((btn) =>
                btn.setButtonText('Cancel').onClick(() => {
                    this.close();
                }),
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
