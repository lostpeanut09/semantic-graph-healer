import { Setting, Notice } from "obsidian";
import type { SectionContext } from "../SectionContext";

export function renderBlacklistSettings(
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

  // --- 13. BLACKLIST MANAGEMENT ---
  createHeader(
    "Blacklist management",
    "Manage ignored suggestions and persistent exclusions.",
  );

  new Setting(containerEl)
    .setName("Proximity ignore list")
    .setDesc(
      `You have ${plugin.settings.proximityIgnoreList.length} items currently ignored.`,
    )
    .addButton((btn) =>
      btn
        .setButtonText("Clear blacklist")
        .setWarning()
        .onClick(async () => {
          plugin.settings.proximityIgnoreList = [];
          await plugin.saveSettings();
          new Notice("Blacklist cleared.");
          refresh();
        }),
    );

  plugin.settings.proximityIgnoreList.slice(-10).forEach((link: string) => {
    const s = new Setting(containerEl).setName(link).addButton((btn) =>
      btn
        .setIcon("cross")
        .setTooltip("Remove from ignore list")
        .onClick(async () => {
          plugin.settings.proximityIgnoreList =
            plugin.settings.proximityIgnoreList.filter(
              (l: string) => l !== link,
            );
          await plugin.saveSettings();
          refresh();
        }),
    );
    s.settingEl.addClass("healer-setting-compact");
    s.infoEl.addClass("healer-setting-info-small");
  });
}
