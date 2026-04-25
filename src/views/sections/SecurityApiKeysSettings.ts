import { Setting, Notice } from "obsidian";
import type { SectionContext } from "../SectionContext";
export function renderSecurityApiKeysSettings(
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

  // --- PHASE 1: SECURITY API KEYS ---
  createHeader(
    "Security API keys",
    "Secure management of Llm and service credentials.",
  );

  const keychainStatus = plugin.keychainService?.isSecure() ?? false;

  new Setting(containerEl)
    .setName("Keychain status")
    .setDesc(
      keychainStatus
        ? "Obsidian Keychain active. Your keys are encrypted at the OS level."
        : "Keychain NOT detected. Keys are stored encrypted (AES-256-GCM) in data.json.",
    )
    .addButton((button) => {
      button
        .setButtonText(keychainStatus ? "Verify connection" : "Migrate results")
        .setCta()
        .onClick(async () => {
          if (keychainStatus) {
            const result = await plugin.keychainService.validateKeychain();
            new Notice(
              result.available
                ? "Keychain validation successful."
                : `Error: ${result.error}`,
            );
          } else {
            await plugin.keychainService.migrateFromSettingsToKeychain(
              "openai",
            );
            new Notice("Critical migration complete.");
            ctx.refresh();
          }
        });
    });

  new Setting(containerEl)
    .setName("Primary analysis key")
    .setDesc(
      "Vault-wide API key for analysis. Saved to system keychain if available.",
    )
    .addText((text) =>
      text
        .setPlaceholder("Enter key")
        .setValue("") // Hide value for security
        .onChange(async (value) => {
          if (value) {
            await plugin.keychainService.setApiKey("openai", value);
            new Notice("Key secured and synchronized.");
          }
        }),
    );
}
