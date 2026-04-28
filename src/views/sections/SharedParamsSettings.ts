import { Setting } from "obsidian";
import type { SectionContext } from "../SectionContext";

export function renderSharedParamsSettings(
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

  // --- 6. Shared AI parameters ---
  createHeader(
    "Shared parameters",
    "Global generation parameters. Higher token limits increase cloud API costs — local models are unaffected.",
  );

  const confidenceSetting = new Setting(containerEl)
    .setName("Confidence threshold")
    .setDesc(
      "Minimum confidence score required for suggestions to be presented.",
    );
  const confidenceValue = confidenceSetting.controlEl.createSpan({
    cls: "healer-slider-value",
  });
  confidenceValue.setText(`${plugin.settings.aiConfidenceThreshold}%`);
  confidenceValue.addClass("healer-ml-20");
  confidenceValue.addClass("healer-font-weight-bold");
  confidenceValue.addClass("healer-text-accent");

  confidenceSetting.addSlider((slider) => {
    slider
      .setLimits(50, 100, 1)
      .setValue(plugin.settings.aiConfidenceThreshold)
      .setDynamicTooltip()
      .onChange((value) => {
        plugin.settings.aiConfidenceThreshold = value;
        confidenceValue.setText(`${String(value)}%`);
        void plugin.saveSettings();
      });
    if ("setInstant" in slider) {
      (slider as { setInstant(v: boolean): void }).setInstant(true);
    }
  });

  const tokensSetting = new Setting(containerEl)
    .setName("Max output tokens")
    .setDesc("Limit the length of generated structural reasoning.");
  const tokensValue = tokensSetting.controlEl.createSpan({
    cls: "healer-slider-value",
  });
  tokensValue.setText(`${plugin.settings.aiMaxTokens}`);
  tokensValue.addClass("healer-ml-20");
  tokensValue.addClass("healer-font-weight-bold");

  tokensSetting.addSlider((slider) => {
    slider
      .setLimits(100, 4000, 100)
      .setValue(plugin.settings.aiMaxTokens)
      .setDynamicTooltip()
      .onChange((value) => {
        plugin.settings.aiMaxTokens = value;
        tokensValue.setText(`${String(value)}`);
        void plugin.saveSettings();
      });
    if ("setInstant" in slider) {
      (slider as { setInstant(v: boolean): void }).setInstant(true);
    }
  });
}
