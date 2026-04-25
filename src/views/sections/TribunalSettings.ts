import { Setting } from "obsidian";
import type { SectionContext } from "../SectionContext";
import { isObsidianInternalApp } from "../../core/HealerUtils";
export function renderTribunalSettings(
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

  // --- 7. The AI tribunal ---
  createHeader(
    "Verification engine",
    "Secondary model for consensus. Uses additional tokens.",
  );

  new Setting(containerEl)
    .setName("Enable verification")
    .setDesc(
      "If enabled, all suggestions must be confirmed by a secondary independent model.",
    )
    .addToggle((toggle) =>
      toggle.setValue(plugin.settings.enableAiTribunal).onChange((value) => {
        plugin.settings.enableAiTribunal = value;
        void (async () => {
          await plugin.saveSettings();
          refresh(); // Refresh to show diversity warning
        })();
      }),
    );

  if (plugin.settings.enableAiTribunal) {
    const isRedundant =
      plugin.settings.llmModelName === plugin.settings.secondaryLlmModelName &&
      plugin.settings.llmEndpoint === plugin.settings.secondaryLlmEndpoint;

    if (isRedundant) {
      containerEl.createEl("div", {
        text: "Primary and secondary providers are identical. The tribunal will be bypassed to save tokens.",
        cls: "healer-warning-banner",
      });
    }
  }

  new Setting(containerEl)
    .setName("Secondary endpoint address")
    .setDesc("Independent server for the secondary model verification.")
    .addText((text) =>
      text.setValue(plugin.settings.secondaryLlmEndpoint).onChange((value) => {
        plugin.settings.secondaryLlmEndpoint = value;
        void plugin.saveSettings();
      }),
    );

  new Setting(containerEl)
    .setName("Secondary model key")
    .setDesc(
      'Secure key for the verification endpoint. For local models, enter "sk-local". For cloud apis, enter the real key.',
    )
    .addText((text) => {
      text
        .setPlaceholder("Enter key...")
        .setValue(plugin.settings.secondaryLlmApiKey);
      text.inputEl.type = "password";
      text.onChange(async (value) => {
        const internalApp = plugin.app;
        if (isObsidianInternalApp(internalApp)) {
          const isSkLocal = value === "sk-local";
          if (internalApp.keychain && value !== "" && !isSkLocal) {
            await internalApp.keychain.set("semantic-healer-secondary", value);
            plugin.settings.secondaryLlmApiKey = "";
          } else {
            plugin.settings.secondaryLlmApiKey = value;
          }
          await plugin.saveSettings();
        }
      });
    });

  new Setting(containerEl)
    .setName("Secondary model selection")
    .setDesc("Select the target verification model.")
    .addDropdown((dropdown) => {
      const models = plugin.settings.secondaryDetectedModels || [];
      models.forEach((m: string) => {
        dropdown.addOption(m, m);
      });
      dropdown
        .setValue(plugin.settings.secondaryLlmModelName)
        .onChange((value) => {
          plugin.settings.secondaryLlmModelName = value;
          void (async () => {
            await plugin.saveSettings();
            refresh(); // Refresh to update diversity check
          })();
        });
    });

  new Setting(containerEl)
    .setName("Detect secondary models")
    .setDesc("Scan the provided secondary endpoint for verification models.")
    .addButton((btn) =>
      btn
        .setButtonText("Scan secondary")
        .onClick(async () => await ctx.runModelDetection(btn, false)),
    );
}
