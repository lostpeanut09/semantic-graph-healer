import { Setting } from "obsidian";
import type { SectionContext } from "../SectionContext";

export function renderExperimentalSettings(
  containerEl: HTMLElement,
  ctx: SectionContext,
) {
  const { plugin, refresh } = ctx;

  const createHeader = (title: string, desc: string) => {
    const setting = new Setting(containerEl)
      .setHeading()
      .setName(title)
      .setDesc(desc);
    setting.settingEl.addClass("healer-category-header");
    return setting.settingEl;
  };

  // --- 8. EXPERIMENTAL FEATURES & PERSONA ---
  createHeader(
    "Experimental features",
    "Non-standard modules and persona behavior constraints.",
  );

  new Setting(containerEl)
    .setName("Persona preset")
    .setDesc(
      'Select the "soul" of your AI healer. Each preset changes the reasoning style.',
    )
    .addDropdown((dropdown) =>
      dropdown
        .addOptions({
          technician: "Ontology Technician (Cold/Precise)",
          architect: "Graph Architect (Hierarchical/flow)",
          artist: "Semantic Artist (Evocative/Deep)",
          custom: "Custom Persona",
        })
        .setValue(plugin.settings.aiPersonaPreset)
        .onChange((value) => {
          plugin.settings.aiPersonaPreset = value;
          void (async () => {
            await plugin.saveSettings();
            refresh(); // Refresh to show/hide custom prompt
          })();
        }),
    );

  if (plugin.settings.aiPersonaPreset === "custom") {
    new Setting(containerEl)
      .setName("Custom prompt template")
      .setDesc(
        "Override instruction prompt for analysis. Use only if persona is set to custom.",
      )
      .addTextArea((text) =>
        text
          .setPlaceholder("Enter system prompt...")
          .setValue(plugin.settings.customAiPersonaPrompt)
          .onChange((value) => {
            plugin.settings.customAiPersonaPrompt = value;
            void plugin.saveSettings();
          }),
      );
  }

  new Setting(containerEl)
    .setName("Enable consistency filter")
    .setDesc(
      "Apply strict boundaries to model output parsing to ensure Obsidian compatibility.",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.enableKarpathyFilter)
        .onChange((value) => {
          plugin.settings.enableKarpathyFilter = value;
          void plugin.saveSettings();
        }),
    );
}
