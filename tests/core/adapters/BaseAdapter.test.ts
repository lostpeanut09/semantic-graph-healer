import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from "vitest";
import type { App } from "obsidian";
import { HealerLogger } from "../../../src/core/utils/HealerLogger";
import { BaseAdapter } from "../../../src/core/adapters/BaseAdapter";

class TestAdapter extends BaseAdapter {
  public readonly id = "test-adapter";

  public available = true;
  public throwOnAvailable = false;
  public throwOnGetLinks = false;

  public getLinksCalls = 0;
  public destroyCalls = 0;
  public onInitializeCalls = 0;

  protected async onInitialize(): Promise<void> {
    this.onInitializeCalls++;
    // Simulate async work
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  public isAvailable(): boolean {
    if (this.throwOnAvailable) throw new Error("boom-available");
    return this.available;
  }

  public async getLinks() {
    this.ensureInitialized();
    this.getLinksCalls++;
    if (this.throwOnGetLinks) throw new Error("boom-links");
    return [];
  }

  public invalidate(): void {}

  protected onDestroy(): void {
    this.destroyCalls++;
  }

  // expose protected for test
  public _isPluginAvailable(id: string): boolean {
    return (
      this as unknown as { isPluginAvailable: (pluginId: string) => boolean }
    ).isPluginAvailable(id);
  }

  public _logDebug(msg: string): void {
    return (
      this as unknown as { logDebug: (message: string) => void }
    ).logDebug(msg);
  }

  public _ensureInitialized(): void {
    return (
      this as unknown as { ensureInitialized: () => void }
    ).ensureInitialized();
  }
}

describe("BaseAdapter", () => {
  let debugSpy: MockInstance;

  beforeEach(() => {
    debugSpy = vi.spyOn(HealerLogger, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    debugSpy.mockRestore();
  });

  it("initialize() calls onInitialize exactly once and handles concurrency", async () => {
    const a = new TestAdapter({} as unknown as App);
    const p1 = a.initialize();
    const p2 = a.initialize();

    await Promise.all([p1, p2]);

    expect(a.onInitializeCalls).toBe(1);
  });

  it("ensureInitialized() throws if called before initialize", () => {
    const a = new TestAdapter({} as unknown as App);
    expect(() => a._ensureInitialized()).toThrow(
      "test-adapter adapter: not initialized",
    );
  });

  it("ensureInitialized() throws if called while initialize is in flight", () => {
    const a = new TestAdapter({} as unknown as App);
    void a.initialize();
    expect(() => a._ensureInitialized()).toThrow(
      "test-adapter adapter: not initialized",
    );
  });

  it("ensureInitialized() does not throw after initialize completes", async () => {
    const a = new TestAdapter({} as unknown as App);
    await a.initialize();
    expect(() => a._ensureInitialized()).not.toThrow();
  });

  it("getLinks throws if not initialized (via ensureInitialized)", async () => {
    const a = new TestAdapter({} as unknown as App);
    await expect(a.getLinks()).rejects.toThrow(
      "test-adapter adapter: not initialized",
    );
  });

  it("destroy() is idempotent and calls onDestroy exactly once", () => {
    const a = new TestAdapter({} as unknown as App);
    a.destroy();
    a.destroy();
    expect(a.isDestroyed).toBe(true);
    expect(a.destroyCalls).toBe(1);
  });

  it("getLinksSafe returns [] if destroyed", async () => {
    const a = new TestAdapter({} as unknown as App);
    a.destroy();
    const res = await a.getLinksSafe();
    expect(res).toEqual([]);
    expect(a.getLinksCalls).toBe(0);
  });

  it("getLinksSafe returns [] if isAvailable throws", async () => {
    const a = new TestAdapter({} as unknown as App);
    a.throwOnAvailable = true;
    const res = await a.getLinksSafe();
    expect(res).toEqual([]);
    expect(a.getLinksCalls).toBe(0);
  });

  it("getLinksSafe returns [] if getLinks throws", async () => {
    const a = new TestAdapter({} as unknown as App);
    await a.initialize();
    a.throwOnGetLinks = true;
    const res = await a.getLinksSafe();
    expect(res).toEqual([]);
    expect(a.getLinksCalls).toBe(1);
  });

  it("logDebug respects debug flag", () => {
    const aNoDebug = new TestAdapter({} as unknown as App, false);
    aNoDebug._logDebug("nope");
    expect(debugSpy).toHaveBeenCalledTimes(0);

    const aDebug = new TestAdapter({} as unknown as App, true);
    aDebug._logDebug("yep");
    expect(debugSpy).toHaveBeenCalledTimes(1);
  });

  it("isPluginAvailable does not throw if enabledPlugins is an array", () => {
    const app = {
      plugins: {
        enabledPlugins: ["x"],
        getPlugin: (id: string) => (id === "x" ? {} : null),
      },
    };
    const a = new TestAdapter(app as unknown as App);
    expect(() => a._isPluginAvailable("x")).not.toThrow();
    expect(a._isPluginAvailable("x")).toBe(true);
  });
});
