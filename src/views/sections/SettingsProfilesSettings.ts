import { Setting, ButtonComponent, Modal, Notice } from "obsidian";
import type { SectionContext } from "../SectionContext";
import type { SettingsPreset } from "../../types";
export function renderSettingsProfilesSettings(
  containerEl: HTMLElement,
  ctx: SectionContext,
) {
  const { plugin, refresh, setCssProps } = ctx;

  const createHeader = (title: string, desc: string) => {
    const setting = new Setting(containerEl)
      .setHeading()
      .setName(title)
      .setDesc(desc);
    setting.settingEl.addClass("healer-category-header");
    return setting.settingEl;
  };

  // --- 14. SETTINGS PROFILES ---
  createHeader(
    "Settings profiles",
    "Quick-load configuration presets for different use cases.",
  );

  new Setting(containerEl)
    .setName("Load preset")
    .setDesc(
      "Quick-load a configuration preset. Current settings will be overridden.",
    )
    .addDropdown((dropdown) => {
      dropdown
        .addOption("balanced", "Balanced (default)")
        .addOption("privacy", "Privacy-first (no cloud AI)")
        .addOption("ai-maximal", "Ai-maximal (all features)")
        .addOption("performance", "Performance (large vaults)")
        .setValue("balanced")
        .onChange(async (value: string) => {
          const presetVal = value as SettingsPreset;
          const confirmed = await new Promise<boolean>((resolve) => {
            const modal = new Modal(ctx.app);
            modal.titleEl.setText("Load preset");
            modal.contentEl.createEl("p", {
              text: `Load the "${value}" preset? This will override your current settings (API keys preserved).`,
            });
            const buttonContainer = modal.contentEl.createDiv({
              cls: "healer-modal-buttons",
            });
            setCssProps(buttonContainer, {
              display: "flex",
              "justify-content": "flex-end",
              gap: "10px",
              "margin-top": "20px",
            });

            let resolved = false;
            const safeResolve = (val: boolean) => {
              if (!resolved) {
                resolved = true;
                resolve(val);
              }
            };
            modal.onClose = () => safeResolve(false);

            new ButtonComponent(buttonContainer)
              .setButtonText("Cancel")
              .onClick(() => {
                modal.close();
                safeResolve(false);
              });

            new ButtonComponent(buttonContainer)
              .setButtonText("Load")
              .setCta()
              .onClick(() => {
                modal.close();
                safeResolve(true);
              });

            modal.open();
          });

          if (confirmed) {
            const presets: Record<
              SettingsPreset,
              Partial<typeof plugin.settings>
            > = {
              balanced: {
                enableSmartConnections: true,
                enableAiTribunal: false,
                requireAITagValidation: true,
                allowNextBranching: false,
                maxNodes: 5000,
                logLevel: "info",
              },
              privacy: {
                enableSmartConnections: false,
                enableAiTribunal: false,
                requireAITagValidation: false,
                llmEndpoint: "http://localhost:11434/v1",
                logLevel: "warn",
              },
              "ai-maximal": {
                enableSmartConnections: true,
                enableAiTribunal: true,
                requireAITagValidation: true,
                requireAIBranchValidation: true,
                requireRelatedReciprocity: true,
                logLevel: "debug",
              },
              performance: {
                enableSmartConnections: false,
                enableAiTribunal: false,
                requireAITagValidation: false,
                maxNodes: 2000,
                maxEdges: 20000,
                enableDeepGraphAnalysis: false,
                logLevel: "error",
              },
            };

            plugin.settings = { ...plugin.settings, ...presets[presetVal] };
            await plugin.saveSettings();
            new Notice(`"${value}" preset loaded.`);
            refresh();
          }
        });
    });
}
