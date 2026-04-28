import { Setting, ButtonComponent, Modal, Notice } from "obsidian";
import type { SectionContext } from "../SectionContext";
import { DEFAULT_SETTINGS } from "../../types";

export function renderAdvancedMaintenanceSettings(
  containerEl: HTMLElement,
  ctx: SectionContext,
) {
  const { plugin, refresh, setCssProps, app } = ctx;

  const createHeader = (title: string, desc: string) => {
    const setting = new Setting(containerEl)
      .setHeading()
      .setName(title)
      .setDesc(desc);
    setting.settingEl.addClass("healer-category-header");
    return setting.settingEl;
  };

  // --- 14. ADVANCED MAINTENANCE ---
  createHeader(
    "Advanced maintenance",
    "Plugin maintenance, backup and reset options.",
  );

  new Setting(containerEl)
    .setName("Export settings")
    .setDesc("Export current settings to a JSON file for backup or sharing.")
    .addButton((button) => {
      button.setButtonText("Export").onClick(async () => {
        const settingsExport = { ...plugin.settings } as Record<
          string,
          unknown
        >;
        // FIX: Aggressive Sanitization (Don't leak even encrypted keys if they guess the salt)
        Object.keys(settingsExport).forEach((k) => {
          if (k.toLowerCase().includes("apikey") || k.endsWith("Encrypted")) {
            delete settingsExport[k];
          }
        });

        const content = JSON.stringify(settingsExport, null, 2);
        const path = `semantic-graph-healer-backup-${Date.now()}.json`;
        await app.vault.create(path, content);
        new Notice(`Settings exported to root folder as ${path}`);
      });
    });

  new Setting(containerEl)
    .setName("Import settings")
    .setDesc(
      "Import settings from a JSON file. Overwrites current configuration.",
    )
    .addButton((button) => {
      button.setButtonText("Import").onClick(() => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json";
        input.onchange = async (e: Event) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;
          const content = await file.text();
          try {
            const imported = JSON.parse(content) as Record<string, unknown>;
            const { SettingsSchema } = await import("../../types.schema");
            const result = SettingsSchema.safeParse(imported);
            if (result.success) {
              plugin.settings = {
                ...plugin.settings,
                ...(result.data as Partial<typeof plugin.settings>),
              };
              await plugin.saveSettings();
              new Notice("Settings imported successfully.");
              refresh();
            } else {
              new Notice("Invalid settings file format.");
              plugin.logger.error(
                "Schema validation failed during import",
                result.error,
              );
            }
          } catch (err: unknown) {
            new Notice("Failed to parse settings file.");
            plugin.logger.error("Settings parse failed", err);
          }
        };
        input.click();
      });
    });

  // --- 11. PERFORMANCE & SYSTEM RESOURCES (SOTA 2026 Audit) ---
  createHeader(
    "Performance & system resources",
    "Optimization for large vaults and execution safety.",
  );

  new Setting(containerEl)
    .setName("Enable graph guardrails")
    .setDesc(
      "Prevent UI freezes by capping the number of nodes and edges in the analytical graph.",
    )
    .addToggle((toggle) =>
      toggle
        .setValue(plugin.settings.enableGraphGuardrails)
        .onChange((value) => {
          plugin.settings.enableGraphGuardrails = value;
          void (async () => {
            await plugin.saveSettings();
            refresh(); // Refresh to show/hide limits
          })();
        }),
    );

  if (plugin.settings.enableGraphGuardrails) {
    const nodeSetting = new Setting(containerEl)
      .setName("Max graph nodes")
      .setDesc(
        "Maximum number of notes to include in analysis. Recommended: 5000.",
      );
    const nodeValue = nodeSetting.controlEl.createSpan({
      cls: "healer-slider-value",
    });
    nodeValue.setText(`${plugin.settings.maxNodes}`);
    nodeValue.addClass("healer-ml-20");
    nodeValue.addClass("healer-font-weight-bold");

    nodeSetting.addSlider((slider) => {
      slider
        .setLimits(1000, 20000, 500)
        .setValue(plugin.settings.maxNodes)
        .setDynamicTooltip()
        .onChange((value) => {
          plugin.settings.maxNodes = value;
          nodeValue.setText(`${String(value)}`);
          void plugin.saveSettings();
        });
      if ("setInstant" in slider) {
        (slider as { setInstant(v: boolean): void }).setInstant(true);
      }
    });

    const edgeSetting = new Setting(containerEl)
      .setName("Max graph edges")
      .setDesc("Maximum number of links for analysis. Recommended: 50000.");
    const edgeValue = edgeSetting.controlEl.createSpan({
      cls: "healer-slider-value",
    });
    edgeValue.setText(`${plugin.settings.maxEdges}`);
    edgeValue.addClass("healer-ml-20");
    edgeValue.addClass("healer-font-weight-bold");

    edgeSetting.addSlider((slider) => {
      slider
        .setLimits(5000, 100000, 5000)
        .setValue(plugin.settings.maxEdges)
        .setDynamicTooltip()
        .onChange((value) => {
          plugin.settings.maxEdges = value;
          edgeValue.setText(`${String(value)}`);
          void plugin.saveSettings();
        });
      if ("setInstant" in slider) {
        (slider as { setInstant(v: boolean): void }).setInstant(true);
      }
    });
  }

  const cacheSetting = new Setting(containerEl)
    .setName("Alias cache ttl")
    .setDesc("Time-to-live for the alias resolution index (minutes).");
  const cacheValue = cacheSetting.controlEl.createSpan({
    cls: "healer-slider-value",
  });
  cacheValue.setText(`${Math.round(plugin.settings.aliasCacheTtl / 60000)}m`);
  cacheValue.addClass("healer-ml-20");
  cacheValue.addClass("healer-font-weight-bold");

  cacheSetting.addSlider((slider) => {
    slider
      .setLimits(1, 60, 1)
      .setValue(Math.round(plugin.settings.aliasCacheTtl / 60000))
      .setDynamicTooltip()
      .onChange((value) => {
        plugin.settings.aliasCacheTtl = value * 60000;
        cacheValue.setText(`${String(value)}m`);
        void plugin.saveSettings();
      });
    if ("setInstant" in slider) {
      (slider as { setInstant(v: boolean): void }).setInstant(true);
    }
  });

  new Setting(containerEl)
    .setName("Clear resolution cache")
    .setDesc("Forced reset of the link and alias resolution index.")
    .addButton((btn) =>
      btn.setButtonText("Clear caches").onClick(() => {
        plugin.quality.invalidateAliasCache();
        plugin.engine.invalidateBacklinkIndex();
        new Notice("Link and alias caches cleared.");
      }),
    );

  const bufferSetting = new Setting(containerEl)
    .setName("Log buffer size")
    .setDesc(
      "Number of recent log entries kept in memory for export/debugging.",
    );
  const bufferValue = bufferSetting.controlEl.createSpan({
    cls: "healer-slider-value",
  });
  bufferValue.setText(`${plugin.settings.logBufferSize}`);
  bufferValue.addClass("healer-ml-20");
  bufferValue.addClass("healer-font-weight-bold");

  bufferSetting.addSlider((slider) => {
    slider
      .setLimits(500, 5000, 100)
      .setValue(plugin.settings.logBufferSize)
      .setDynamicTooltip()
      .onChange((value) => {
        plugin.settings.logBufferSize = value;
        bufferValue.setText(`${String(value)}`);
        void plugin.saveSettings();
      });
    if ("setInstant" in slider) {
      (slider as { setInstant(v: boolean): void }).setInstant(true);
    }
  });

  const timeoutSetting = new Setting(containerEl)
    .setName("Worker timeout")
    .setDesc(
      "Seconds to wait for background analytical tasks (pagerank, community).",
    );
  const timeoutValue = timeoutSetting.controlEl.createSpan({
    cls: "healer-slider-value",
  });
  timeoutValue.setText(`${plugin.settings.workerTimeout}s`);
  timeoutValue.addClass("healer-ml-20");
  timeoutValue.addClass("healer-font-weight-bold");

  timeoutSetting.addSlider((slider) => {
    slider
      .setLimits(30, 600, 30)
      .setValue(plugin.settings.workerTimeout)
      .setDynamicTooltip()
      .onChange((value) => {
        plugin.settings.workerTimeout = value;
        timeoutValue.setText(`${String(value)}s`);
        void plugin.saveSettings();
      });
    if ("setInstant" in slider) {
      (slider as { setInstant(v: boolean): void }).setInstant(true);
    }
  });

  new Setting(containerEl)
    .setName("Reset all settings")
    .setDesc("Restore all settings to default values. This cannot be undone.")
    .addButton((button) => {
      button
        .setButtonText("Factory reset")
        .setWarning()
        .onClick(async () => {
          const confirmed = await new Promise<boolean>((resolve) => {
            const modal = new Modal(app);
            modal.titleEl.setText("Factory reset settings");
            modal.contentEl.createEl("p", {
              text: "Restores all settings to defaults. Proceed?",
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
              .setButtonText("Reset")
              .setWarning()
              .onClick(() => {
                modal.close();
                safeResolve(true);
              });

            modal.open();
          });

          if (confirmed) {
            plugin.settings = { ...DEFAULT_SETTINGS };
            await plugin.saveSettings();
            new Notice("Settings reset to factory defaults.");
            refresh();
          }
        });
    });
}
