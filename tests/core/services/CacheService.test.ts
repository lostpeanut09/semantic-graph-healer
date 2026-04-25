import { beforeEach, describe, expect, it, vi } from "vitest";
import { Plugin, normalizePath } from "obsidian";
import { CacheService } from "../../../src/core/CacheService";

// Mocks
vi.mock("obsidian", async () => {
  const actual = await vi.importActual<any>("obsidian");
  return {
    ...actual,
    normalizePath: vi.fn((p) => p.replace(/\/+/g, "/")),
  };
});

vi.mock("../../../src/core/HealerUtils", () => ({
  HealerLogger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("CacheService Hardening", () => {
  let plugin: any;
  let service: CacheService;
  let adapter: any;

  beforeEach(() => {
    vi.clearAllMocks();
    plugin = {
      manifest: { dir: "/mock/dir", id: "test-plugin" },
      app: {
        vault: {
          adapter: {
            exists: vi.fn(),
            read: vi.fn(),
            write: vi.fn(),
            remove: vi.fn(),
            rename: vi.fn(),
          },
        },
      },
    };
    adapter = plugin.app.vault.adapter;
    service = new CacheService(plugin as any);
  });

  describe("Constructor", () => {
    it("uses normalizePath and handles missing dir", () => {
      expect(normalizePath).toHaveBeenCalled();
      // Default path in mock is /mock/dir/healer-cache.json
      expect((service as any)._cacheFilePath).toContain("healer-cache.json");
    });

    it("falls back to plugin id if dir is missing", () => {
      plugin.manifest.dir = undefined;
      const newService = new CacheService(plugin);
      expect((newService as any)._cacheFilePath).toContain(
        "test-plugin/healer-cache.json",
      );
    });
  });

  describe("saveImmediate() - Atomic Write", () => {
    it("tries direct rename first (safer atomicity)", async () => {
      adapter.exists.mockResolvedValue(true);
      adapter.write.mockResolvedValue(undefined);
      adapter.rename.mockResolvedValue(undefined);

      await service.saveImmediate();

      expect(adapter.write).toHaveBeenCalled();
      expect(adapter.rename).toHaveBeenCalled();
      // In the direct success case, remove should NOT be called
      expect(adapter.remove).not.toHaveBeenCalled();
    });

    it("falls back to remove+rename if direct rename fails", async () => {
      adapter.exists.mockResolvedValue(true);
      adapter.write.mockResolvedValue(undefined);
      // First rename fails (e.g. file exists protected)
      adapter.rename.mockRejectedValueOnce(new Error("Rename collision"));
      adapter.remove.mockResolvedValue(undefined);
      adapter.rename.mockResolvedValue(undefined);

      await service.saveImmediate();

      expect(adapter.remove).toHaveBeenCalled();
      expect(adapter.rename).toHaveBeenCalledTimes(2);
    });
  });

  describe("saveImmediate() - Serialization (Promise Chain)", () => {
    it("serializes concurrent writes ensuring they do not overlap", async () => {
      let activeWrites = 0;
      let maxConcurrentWrites = 0;

      adapter.exists.mockResolvedValue(true);
      adapter.write.mockImplementation(async () => {
        activeWrites++;
        maxConcurrentWrites = Math.max(maxConcurrentWrites, activeWrites);
        await new Promise((resolve) => setTimeout(resolve, 10)); // Simulate IO delay
        activeWrites--;
      });
      adapter.rename.mockResolvedValue(undefined);

      // Trigger multiple saves concurrently
      const p1 = service.saveImmediate();
      const p2 = service.saveImmediate();
      const p3 = service.saveImmediate();

      await Promise.all([p1, p2, p3]);

      // If serialized, maxConcurrentWrites must be 1
      expect(maxConcurrentWrites).toBe(1);
      expect(adapter.write).toHaveBeenCalledTimes(3);
    });

    it("continues chain even if one write fails", async () => {
      adapter.exists.mockResolvedValue(true);
      adapter.write
        .mockRejectedValueOnce(new Error("IO Failure"))
        .mockResolvedValue(undefined);
      adapter.rename.mockResolvedValue(undefined);

      const p1 = service.saveImmediate();
      const p2 = service.saveImmediate();

      await Promise.all([p1, p2]);

      expect(adapter.write).toHaveBeenCalledTimes(2);
      expect(adapter.rename).toHaveBeenCalledTimes(1);
    });
  });

  describe("load()", () => {
    it("handles corrupted JSON by preserving it to .corrupt", async () => {
      adapter.exists.mockResolvedValue(true);
      adapter.read.mockResolvedValue("invalid json {[");
      adapter.rename.mockResolvedValue(undefined);

      await service.load();

      expect(service.suggestions).toEqual([]);
      expect(adapter.rename).toHaveBeenCalledWith(
        expect.stringContaining("healer-cache.json"),
        expect.stringContaining("healer-cache.json.corrupt"),
      );
    });

    it("loads valid JSON correctly", async () => {
      const mockData = {
        pendingSuggestions: [{ id: "1" }],
        history: [{ timestamp: 123 }],
      };
      adapter.exists.mockResolvedValue(true);
      adapter.read.mockResolvedValue(JSON.stringify(mockData));

      await service.load();

      expect(service.suggestions).toHaveLength(1);
      expect(service.history).toHaveLength(1);
    });
  });
});
