import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushSync } from "svelte";
import Dashboard from "../../../src/views/dashboard/components/Dashboard.svelte";
import { DashboardStore } from "../../../src/views/dashboard/DashboardStore.svelte";

type DashboardPluginContext = ConstructorParameters<typeof DashboardStore>[0];

describe("Dashboard Component", () => {
  let mockPlugin: unknown;
  let target: HTMLElement;

  beforeEach(() => {
    target = document.createElement("div");
    document.body.appendChild(target);

    mockPlugin = {
      app: {
        workspace: {
          on: vi.fn().mockReturnValue({}),
        },
        vault: {
          adapter: {
            getResourcePath: vi.fn().mockReturnValue("banner.png"),
          },
        },
      },
      manifest: { dir: "plugin" },
      registerEvent: vi.fn(),
      cache: {
        suggestions: [
          {
            id: "bridge_gap_1",
            type: "topology_gap",
            category: "suggestion",
            link: "A",
            source: "B",
            timestamp: 0,
          },
          {
            id: "cycle_1",
            type: "deterministic",
            category: "error",
            link: "C",
            source: "D",
            timestamp: 0,
          },
          {
            id: "ai_1",
            type: "ai",
            category: "suggestion",
            link: "E",
            source: "F",
            timestamp: 0,
          },
        ],
        history: [],
      },
      executor: {
        execute: vi.fn(),
      },
      settings: { proximityIgnoreList: [] },
    };
  });

  it("renders tabs and banner", () => {
    const store = new DashboardStore(
      mockPlugin as unknown as DashboardPluginContext,
    );
    mount(Dashboard, {
      target,
      props: { store, plugin: mockPlugin },
    });

    expect(target.querySelector(".healer-dashboard-banner")).toBeTruthy();
    expect(target.querySelectorAll(".healer-tab-btn").length).toBe(6);
    expect(target.textContent).toContain("All issues");
  });

  it("filters items when clicking tabs", async () => {
    const store = new DashboardStore(
      mockPlugin as unknown as DashboardPluginContext,
    );
    mount(Dashboard, {
      target,
      props: { store, plugin: mockPlugin },
    });

    // Initially shows all 3
    expect(target.querySelectorAll(".healer-suggestion-card").length).toBe(3);

    // Find "Logic loops" tab button
    const logicTab = Array.from(
      target.querySelectorAll(".healer-tab-btn"),
    ).find(
      (btn) => btn.textContent?.trim() === "Logic loops",
    ) as HTMLButtonElement;

    logicTab.click();
    flushSync();

    // Should now only show 1
    expect(target.querySelectorAll(".healer-suggestion-card").length).toBe(1);
  });

  it("shows empty state when no items match tab", async () => {
    const store = new DashboardStore(
      mockPlugin as unknown as DashboardPluginContext,
    );
    mount(Dashboard, {
      target,
      props: { store, plugin: mockPlugin },
    });

    const blackHoleTab = Array.from(
      target.querySelectorAll(".healer-tab-btn"),
    ).find(
      (btn) => btn.textContent?.trim() === "Black holes",
    ) as HTMLButtonElement;

    blackHoleTab.click();
    flushSync();

    expect(target.textContent).toContain("No issues found for this category.");
  });
});
