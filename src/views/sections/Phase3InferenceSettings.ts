import { Setting } from 'obsidian';
import type { SectionContext } from '../SectionContext';

export function renderPhase3InferenceSettings(containerEl: HTMLElement, ctx: SectionContext) {
    const { plugin } = ctx;

    const createHeader = (title: string, desc: string) => {
        const setting = new Setting(containerEl).setHeading().setName(title).setDesc(desc);
        setting.settingEl.addClass('healer-category-header');
        return setting.settingEl;
    };

    // --- 10. EXPERIMENTAL AI INFERENCE (PHASE 3) ---
    createHeader(
        'Phase 3: AI Inference (Experimental)',
        'Advanced semantic reasoning and topological validation using Llms (Local or Cloud).',
    );

    new Setting(containerEl)
        .setName('Require related reciprocity')
        .setDesc('Force reciprocity even for weak "related" links using AI validation.')
        .addToggle((toggle) =>
            toggle.setValue(plugin.settings.requireRelatedReciprocity).onChange((value) => {
                plugin.settings.requireRelatedReciprocity = value;
                void plugin.saveSettings();
            }),
        );

    new Setting(containerEl)
        .setName('Allow multiple next branches')
        .setDesc('Permit a note to have multiple sequential continuations without topological errors.')
        .addToggle((toggle) =>
            toggle.setValue(plugin.settings.allowNextBranching).onChange((value) => {
                plugin.settings.allowNextBranching = value;
                void plugin.saveSettings();
            }),
        );

    new Setting(containerEl)
        .setName('Allow multiple prev branches')
        .setDesc('Permit a note to have multiple sequential predecessors without topological errors.')
        .addToggle((toggle) =>
            toggle.setValue(plugin.settings.allowPrevBranching).onChange((value) => {
                plugin.settings.allowPrevBranching = value;
                void plugin.saveSettings();
            }),
        );

    new Setting(containerEl)
        .setName('Branch validation')
        .setDesc('On-demand verification for next and previous branches. Independent from the automated tribunal.')
        .addToggle((toggle) =>
            toggle.setValue(plugin.settings.requireAIBranchValidation).onChange((value) => {
                plugin.settings.requireAIBranchValidation = value;
                void plugin.saveSettings();
            }),
        );

    new Setting(containerEl)
        .setName('Tag propagation')
        .setDesc('Suggest updates for child tags based on context.')
        .addToggle((toggle) =>
            toggle.setValue(plugin.settings.requireAITagValidation).onChange((value) => {
                plugin.settings.requireAITagValidation = value;
                void plugin.saveSettings();
            }),
        );
}
