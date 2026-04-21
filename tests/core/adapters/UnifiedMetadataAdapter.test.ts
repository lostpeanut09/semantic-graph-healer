import { describe, it, expect, vi, beforeEach } from "vitest";
import { UnifiedMetadataAdapter } from "../../../src/core/adapters/UnifiedMetadataAdapter";

// Mock sub-adapters
vi.mock("../../../src/core/adapters/DatacoreAdapter", () => {
  return {
    DatacoreAdapter: class {
      getPage = vi.fn();
      queryPages = vi.fn();
      getPages = vi.fn();
      getBacklinks = vi.fn();
      getDataviewApi = vi.fn();
      invalidate = vi.fn();
      destroy = vi.fn();
      invalidateBacklinkIndex = vi.fn();
    },
  };
});

vi.mock("../../../src/core/adapters/BreadcrumbsAdapter", () => {
  return {
    BreadcrumbsAdapter: class {
      getHierarchy = vi.fn();
      invalidate = vi.fn();
      destroy = vi.fn();
    },
  };
});

vi.mock("../../../src/core/adapters/SmartConnectionsAdapter", () => {
  return {
    SmartConnectionsAdapter: class {
      getRelatedNotes = vi.fn();
      invalidate = vi.fn();
      destroy = vi.fn();
    },
  };
});

// Mock Obsidian
vi.mock("obsidian", () => ({
  App: vi.fn(),
  TFile: vi.fn(),
  parseLinktext: (t: string) => ({ path: t }),
  TFolder: vi.fn(),
  normalizePath: (p: string) => p,
}));

describe("UnifiedMetadataAdapter Hardening", () => {
  let adapter: UnifiedMetadataAdapter;
  let mockApp: any;
  let mockSettings: any;

  beforeEach(() => {
    mockApp = {
      vault: {
        getAbstractFileByPath: vi.fn().mockImplementation((p) => ({ path: p })),
        on: vi.fn(),
        off: vi.fn(),
      },
      metadataCache: {
        on: vi.fn(),
        off: vi.fn(),
        getFirstLinkpathDest: vi.fn(),
      },
    };

    mockSettings = {
      logLevel: "info",
    };

    adapter = new UnifiedMetadataAdapter(mockApp, mockSettings, {
      ttlMs: 10000,
    });
  });

  it("should return cached page on repeated calls", () => {
    const datacore = (adapter as any).datacore;
    const mockPage = { file: { path: "test.md" } };
    datacore.getPage.mockReturnValue(mockPage);

    const res1 = adapter.getPage("test.md");
    const res2 = adapter.getPage("test.md");

    expect(res1).toBe(mockPage);
    expect(res2).toBe(mockPage);
    expect(datacore.getPage).toHaveBeenCalledTimes(1);
  });

  it("should be resilient to sub-adapter failures (safeExecute)", () => {
    const datacore = (adapter as any).datacore;
    datacore.getBacklinks.mockImplementation(() => {
      throw new Error("Datacore Crash");
    });

    // Should not throw, should return fallback []
    const res = adapter.getBacklinks("test.md");
    expect(res).toEqual([]);
  });

  it("should cache related notes (Smart Connections) with short TTL", async () => {
    const sc = (adapter as any).smartConnections;
    const mockNotes = [{ path: "related.md", score: 0.9 }];
    sc.getRelatedNotes.mockResolvedValue(mockNotes);

    const res1 = await adapter.getRelatedNotes("test.md", 5);
    const res2 = await adapter.getRelatedNotes("test.md", 5);

    expect(res1).toEqual(mockNotes);
    expect(res2).toEqual(mockNotes);
    expect(sc.getRelatedNotes).toHaveBeenCalledTimes(1);
  });

  it("should invalidate all caches correctly", () => {
    const datacore = (adapter as any).datacore;
    const bc = (adapter as any).breadcrumbs;
    const sc = (adapter as any).smartConnections;

    datacore.getPage.mockReturnValue({ file: { path: "test.md" } });
    adapter.getPage("test.md");

    adapter.invalidate("test.md");

    adapter.getPage("test.md");
    expect(datacore.getPage).toHaveBeenCalledTimes(2);
    expect(bc.invalidate).toHaveBeenCalledWith("test.md");
    expect(sc.invalidate).toHaveBeenCalledWith("test.md");
  });

  it("should handle async failures in hierarchy (safeExecuteAsync)", async () => {
    const bc = (adapter as any).breadcrumbs;
    bc.getHierarchy.mockRejectedValue(new Error("BC Failed"));

    const res = await adapter.getHierarchy("test.md");
    expect(res).toBeNull();
  });

  it("should destroy all sub-adapters even if one throws", async () => {
    const datacore = (adapter as any).datacore;
    const breadcrumbs = (adapter as any).breadcrumbs;
    const smartConnections = (adapter as any).smartConnections;

    datacore.destroy.mockImplementation(() => {
      throw new Error("Datacore destroy crash");
    });

    // Should not throw, and other adapters must still be destroyed
    await expect(adapter.destroy()).resolves.not.toThrow();
    expect(datacore.destroy).toHaveBeenCalled();
    expect(breadcrumbs.destroy).toHaveBeenCalled();
    expect(smartConnections.destroy).toHaveBeenCalled();
  });
});
