import { Setting } from "obsidian";
import type { SectionContext } from "../SectionContext";

export function renderHierarchiesSettings(
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

  // --- 3. HIERARCHIES ---
  createHeader(
    "Hierarchies",
    "Map specific properties to topological directions.",
  );

  const h = plugin.settings.hierarchies[0];
  if (h) {
    new Setting(containerEl)
      .setName("Upward properties (parent)")
      .setDesc(
        'Comma-separated list of properties treated as "up" (parent) nodes.',
      )
      .addText((text) =>
        text.setValue(h.up.join(", ")).onChange((value) => {
          h.up = value
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s);
          void plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Downward properties (child)")
      .setDesc(
        'Comma-separated list of properties treated as "down" (child) nodes.',
      )
      .addText((text) =>
        text.setValue(h.down.join(", ")).onChange((value) => {
          h.down = value
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s);
          void plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Next properties (sequential)")
      .setDesc(
        'Comma-separated list of properties treated as "next" in a sequence.',
      )
      .addText((text) =>
        text.setValue(h.next.join(", ")).onChange((value) => {
          h.next = value
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s);
          void plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Previous properties (sequential)")
      .setDesc(
        'Comma-separated list of properties treated as "previous" in a sequence.',
      )
      .addText((text) =>
        text.setValue(h.prev.join(", ")).onChange((value) => {
          h.prev = value
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s);
          void plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Sibling properties (symmetric)")
      .setDesc(
        "Comma-separated list of properties treated as symmetric siblings. Missing reciprocals will be flagged.",
      )
      .addText((text) =>
        text.setValue(h.same.join(", ")).onChange((value) => {
          h.same = value
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s);
          void plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Related properties (unidirectional)")
      .setDesc(
        "Comma-separated list for non-hierarchical contextual mentions. These are unidirectional and never flagged as errors.",
      )
      .addText((text) =>
        text.setValue(h.related.join(", ")).onChange((value) => {
          h.related = value
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s);
          void plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Strict down-hierarchy validation")
      .setDesc(
        "Enforce 1-to-1 relationships for child properties (down) by default. If disabled, multiple children are allowed without error.",
      )
      .addToggle((toggle) =>
        toggle.setValue(plugin.settings.strictDownCheck).onChange((value) => {
          plugin.settings.strictDownCheck = value;
          void (async () => {
            await plugin.saveSettings();
            await plugin.analyzeGraph();
          })();
        }),
      );

    const customRulesSetting = new Setting(containerEl)
      .setName("Custom topology rules")
      .setDesc(
        "Define specific constraints for certain folders or properties using JSON and regex. Overrides global strictness.",
      );
    customRulesSetting.settingEl.addClass("healer-block-setting");
    let rulesDebounce: number;
    customRulesSetting.addTextArea((text) => {
      text.setValue(
        JSON.stringify(plugin.settings.customTopologyRules, null, 2),
      );
      text.inputEl.rows = 6;
      text.inputEl.addClass("healer-json-textarea");
      text.setPlaceholder(
        '[\n  { "pattern": "^Projects/", "property": "up", "maxCount": 2, "severity": "info" }\n]',
      );
      text.onChange((v) => {
        if (rulesDebounce) window.clearTimeout(rulesDebounce);
        rulesDebounce = window.setTimeout(() => {
          void (async () => {
            try {
              const parsed = JSON.parse(v) as {
                pattern: string;
                property: string;
                maxCount: number;
                severity: "info" | "error" | "suggestion";
              }[];
              plugin.settings.customTopologyRules = parsed;
              await plugin.saveSettings();
              await plugin.analyzeGraph();
              text.inputEl.removeClass("healer-border-error");
            } catch {
              text.inputEl.addClass("healer-border-error");
            }
          })();
        }, 1000);
      });
    });
  }
}
