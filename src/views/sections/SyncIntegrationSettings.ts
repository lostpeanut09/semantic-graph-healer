import { Setting, Notice } from "obsidian";
import type { SectionContext } from "../SectionContext";

export function renderSyncIntegrationSettings(
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

  // --- 11. SYNC INTEGRATION ---
  createHeader(
    "Sync integration",
    "Compatibility with external topological engines.",
  );

  new Setting(containerEl)
    .setName("Sync from external plugins")
    .setDesc(
      "Scan for existing taxonomies in breadcrumbs or excalibrain data folders and import them.",
    )
    .addButton((btn) =>
      btn
        .setButtonText("Sync data now")
        .setCta()
        .onClick(async () => {
          btn.setButtonText("Scanning...");
          btn.setDisabled(true);
          const success = await plugin.syncExternalSettings();
          if (success) {
            new Notice(
              "Topologies successfully imported from external plugins!",
            );
            refresh();
            // ✅ NEW: Trigger analysis with new hierarchies
            new Notice("Running graph analysis with new hierarchy...");
            await plugin.analyzeGraph();
          } else {
            new Notice(
              "No compatible settings found in breadcrumbs or excalibrain.",
            );
          }
          btn.setButtonText("Sync data now");
          btn.setDisabled(false);
        }),
    );
}
