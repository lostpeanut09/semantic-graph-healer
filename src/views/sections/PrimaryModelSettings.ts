import { Setting } from "obsidian";
import type { SectionContext } from "../SectionContext";
import { isObsidianInternalApp } from "../../core/HealerUtils";
export function renderPrimaryModelSettings(
  containerEl: HTMLElement,
  ctx: SectionContext,
) {
  const { plugin, refresh, runModelDetection } = ctx;

  const createHeader = (title: string, desc: string) => {
    const setting = new Setting(containerEl)
      .setHeading()
      .setName(title)
      .setDesc(desc);
    setting.settingEl.addClass("healer-category-header");
    return setting.settingEl;
  };

  // --- 6. Multi-provider LLM ---
  createHeader(
    "Primary model configuration",
    "Main intelligence engine. Note: only local models (e.g. Ollama) are free — cloud providers charge per token. Check your provider.",
  );

  if (
    !plugin.settings.detectedModels ||
    plugin.settings.detectedModels.length === 0
  ) {
    containerEl.createDiv({
      cls: "healer-warning-banner",
      text: 'First time? Enter your endpoint and key, then click "Detect primary models" to populate the choices.',
    });
  }

  new Setting(containerEl)
    .setName("Endpoint address")
    .setDesc("Server address for the primary model endpoint.")
    .addText((text) =>
      text
        .setPlaceholder("Enter address...")
        .setValue(plugin.settings.llmEndpoint)
        .onChange((value) => {
          plugin.settings.llmEndpoint = value;
          void plugin.saveSettings();
        }),
    );

  new Setting(containerEl)
    .setName("Model key")
    .setDesc(
      'Securely stored key for the model. For local models, enter "sk-local". For cloud apis, enter the real key.',
    )
    .addText((text) => {
      text.setPlaceholder("Enter key...").setValue(plugin.settings.llmApiKey);
      text.inputEl.type = "password";
      text.onChange(async (value) => {
        const internalApp = plugin.app;
        if (internalApp && isObsidianInternalApp(internalApp)) {
          if (internalApp.keychain && value !== "sk-local" && value !== "") {
            await internalApp.keychain.set("semantic-healer-primary", value);
            plugin.settings.llmApiKey = "";
          } else {
            plugin.settings.llmApiKey = value;
          }
          await plugin.saveSettings();
        }
      });
    });

  new Setting(containerEl)
    .setName("Primary model selection")
    .setDesc(
      "Select the target model from the detected choices on your primary endpoint.",
    )
    .addDropdown((dropdown) => {
      (plugin.settings.detectedModels || []).forEach((m: string) => {
        dropdown.addOption(m, m);
      });
      dropdown.setValue(plugin.settings.llmModelName).onChange((value) => {
        plugin.settings.llmModelName = value;
        void (async () => {
          await plugin.saveSettings();
          refresh(); // Refresh to update diversity check
        })();
      });
    });

  new Setting(containerEl)
    .setName("Detect primary models")
    .setDesc("Scan the primary endpoint for available models.")
    .addButton((btn) =>
      btn
        .setButtonText("Scan primary")
        .onClick(async () => await runModelDetection(btn, true)),
    );
}
