import { Setting } from "obsidian";
import type { SectionContext } from "../SectionContext";

export function renderResilienceSettings(
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

  // --- 5. RESILIENCE & RELIABILITY ---
  createHeader("Resilience and reliability", "AI reliability and retry logic.");

  new Setting(containerEl)
    .setName("Llm max retries")
    .setDesc("Number of times to retry a failed AI query before giving up.")
    .addSlider((slider) => {
      slider
        .setLimits(0, 5, 1)
        .setValue(plugin.settings.llmMaxRetries || 2)
        .setDynamicTooltip()
        .onChange((value) => {
          plugin.settings.llmMaxRetries = value;
          void plugin.saveSettings();
        });
    });

  new Setting(containerEl)
    .setName("Retry on status codes")
    .setDesc(
      "Comma-separated list of HTTP status codes that trigger a retry (e.g., 429, 408, 503).",
    )
    .addText((text) =>
      text
        .setValue(plugin.settings.llmRetryableStatuses.join(", "))
        .onChange((value) => {
          plugin.settings.llmRetryableStatuses = value
            .split(",")
            .map((s) => parseInt(s.trim()))
            .filter((n) => !isNaN(n));
          void plugin.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Generation temperature")
    .setDesc(
      "Higher values (0.8+) are more creative, lower values (0.2) are more deterministic.",
    )
    .addSlider((slider) => {
      slider
        .setLimits(0, 1, 0.1)
        .setValue(plugin.settings.aiTemperature ?? 0.7)
        .setDynamicTooltip()
        .onChange((value) => {
          plugin.settings.aiTemperature = value;
          void plugin.saveSettings();
        });
    });
}
