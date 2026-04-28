import { Setting } from "obsidian";
import type { SectionContext } from "../SectionContext";

export function renderRulesSettings(
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

  // --- 3. Rules ---
  createHeader(
    "Rules",
    "Advanced graph logic constraints for automated analysis.",
  );

  new Setting(containerEl)
    .setName("Implied symmetric edges")
    .setDesc(
      "Assume that if node a links to node b, node b should link back to node a with the inverse relation.",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.impliedSymmetricEdges)
        .onChange(async (v) => {
          plugin.settings.impliedSymmetricEdges = v;
          await plugin.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Implied transitive siblings")
    .setDesc(
      "If node a and node b share the same parent, automatically treat them as siblings in semantic history.",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.impliedTransitiveSiblings)
        .onChange((value) => {
          plugin.settings.impliedTransitiveSiblings = value;
          void plugin.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Detect missing skips")
    .setDesc(
      "Identify non-consecutive jumps (e.g., parent linking directly to grandchild, skipping the child node).",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.detectTaxonomicSkips)
        .onChange((value) => {
          plugin.settings.detectTaxonomicSkips = value;
          void plugin.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Regex exclusion filter")
    .setDesc(
      "Skip files matching this pattern (e.g., ^Templates/.*). Useful for excluding large attachment folders.",
    )
    .addText((text) =>
      text.setValue(plugin.settings.regexExclusionFilter).onChange((value) => {
        plugin.settings.regexExclusionFilter = value;
        void plugin.saveSettings();
      }),
    );
}
