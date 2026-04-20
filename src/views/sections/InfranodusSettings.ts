import { Setting, Notice } from 'obsidian';
import type { SectionContext } from '../SectionContext';
import { isObsidianInternalApp } from '../../core/HealerUtils';
export function renderInfranodusSettings(containerEl: HTMLElement, ctx: SectionContext) {
    const { plugin } = ctx;

    const createHeader = (title: string, desc: string) => {
        const setting = new Setting(containerEl).setHeading().setName(title).setDesc(desc);
        setting.settingEl.addClass('healer-category-header');
        return setting.settingEl;
    };

    // --- 11. INFRANODUS SYNERGY ---
    createHeader('Network synergy', 'Advanced science and structural gap analysis.');

    new Setting(containerEl)
        .setName('Enable network integration')
        .setDesc('Toggle advanced network analysis via external services.')
        .addToggle((toggle) =>
            toggle.setValue(plugin.settings.enableInfraNodus).onChange((value) => {
                plugin.settings.enableInfraNodus = value;
                void plugin.saveSettings();
            }),
        );

    new Setting(containerEl)
        .setName('Token')
        .setDesc('Enter your secure token for the infranodus network analysis service.')
        .addText((text) => {
            text.setPlaceholder('Enter infranodus token...').setValue(plugin.settings.infraNodusApiKey);
            text.inputEl.type = 'password';
            text.onChange(async (v) => {
                const internalApp = plugin.app;
                if (isObsidianInternalApp(internalApp)) {
                    if (internalApp.keychain && v !== '') {
                        await internalApp.keychain.set('semantic-healer-infranodus', v);
                        plugin.settings.infraNodusApiKey = '';
                    } else {
                        plugin.settings.infraNodusApiKey = v;
                    }
                    await plugin.saveSettings();
                }
            });
        });

    new Setting(containerEl)
        .setName('Fetch structural gaps')
        .setDesc('Identify missing links between clusters using network science.')
        .addButton((btn) =>
            btn.setButtonText('Fetch gaps').onClick(async () => {
                btn.setButtonText('Querying service...');
                const count = await plugin.fetchInfraNodusGaps();
                if (count > 0) {
                    new Notice(`System identified ${count} structural gaps! Review actions.`);
                } else if (count === 0) {
                    new Notice('No structural gaps detected in the active note.');
                } else {
                    new Notice('Service error. Check token.');
                }
                btn.setButtonText('Fetch gaps');
            }),
        );
}
