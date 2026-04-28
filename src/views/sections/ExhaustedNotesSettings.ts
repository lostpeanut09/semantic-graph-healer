import { Setting, Notice } from "obsidian";
import type { SectionContext } from "../SectionContext";

export function renderExhaustedNotesSettings(
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

  // --- 12. EXHAUSTED NOTES TRACKING ---
  createHeader(
    "Exhausted notes tracking",
    "AI will skip scanning these notes until the list is reset.",
  );

  new Setting(containerEl)
    .setName("Exhausted notes count")
    .setDesc(
      `Number of notes marked as fully scanned: ${plugin.settings.fullyScannedNotes.length}`,
    )
    .addButton((btn) =>
      btn.setButtonText("Reset scanned notes").onClick(async () => {
        plugin.settings.fullyScannedNotes = [];
        await plugin.saveSettings();
        new Notice("Exhausted notes list cleared.");
        refresh();
      }),
    );
}
