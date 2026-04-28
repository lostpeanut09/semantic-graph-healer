import { Setting } from "obsidian";
import type { SectionContext } from "../SectionContext";

export function renderCoreSettings(
  containerEl: HTMLElement,
  ctx: SectionContext,
) {
  const { plugin } = ctx;

  const createHeader = (title: string, desc: string) => {
    const setting = new Setting(containerEl)
      .setHeading()
      .setName(title)
      .setDesc(desc);
    setting.settingEl.addClass("healer-category-header");
    return setting.settingEl;
  };

  // --- 1. CORE ---
  createHeader("Core", "General rules for the link analyzer and scan scope.");

  new Setting(containerEl)
    .setName("Scan folder")
    .setDesc(
      "Specific folder to scan for topological inconsistencies. Default is / (entire vault).",
    )
    .addText((text) =>
      text
        .setPlaceholder("/")
        .setValue(plugin.settings.scanFolder)
        .onChange((value) => {
          plugin.settings.scanFolder = value;
          void plugin.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Ignore orphan notes")
    .setDesc(
      "Hide warnings for notes with no hierarchical links in the dashboard.",
    )
    .addToggle((toggle) =>
      toggle.setValue(plugin.settings.ignoreOrphanNotes).onChange((value) => {
        plugin.settings.ignoreOrphanNotes = value;
        void plugin.saveSettings();
      }),
    );

  new Setting(containerEl)
    .setName("Include other hubs")
    .setDesc("Enable scanning for additional file types")
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.includeNonMarkdownHubs)
        .onChange((value) => {
          plugin.settings.includeNonMarkdownHubs = value;
          void plugin.saveSettings();
        }),
    );
}
