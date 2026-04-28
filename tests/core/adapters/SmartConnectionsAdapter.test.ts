// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/core/HealerUtils", async () => {
  const actual = await vi.importActual("../../../src/core/HealerUtils");
  return {
    ...actual,
    HealerLogger: {
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    isObsidianInternalApp: vi.fn(() => true),
  };
});

vi.mock("obsidian", () => ({
  App: class MockApp {},
  TFile: class MockTFile {
    path: string;
    basename: string;
    stat: { ctime: number; mtime: number };

    constructor(path = "folder/note.md", mtime = 1000) {
      this.path = path;
      this.basename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
      this.stat = { ctime: 0, mtime };
    }
  },
  parseLinktext: vi.fn((value: string) => {
    const idx = value.indexOf("#");
    if (idx === -1) return { path: value, subpath: "" };
    return { path: value.slice(0, idx), subpath: value.slice(idx) };
  }),
}));

// Helper for safely stringifying objects with circular references
function getCircularReplacer() {
  const seen = new WeakSet();
  return (key: string, value: any) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  };
}

import { SmartConnectionsAdapter } from "../../../src/core/adapters/SmartConnectionsAdapter";
import { TFile, type App } from "obsidian";
import { HealerLogger } from "../../../src/core/HealerUtils";

const makeTFile = (path: string, mtime = 1000): TFile =>
  new (TFile as any)(path, mtime) as TFile;

describe("SmartConnectionsAdapter", () => {
  let adapter: SmartConnectionsAdapter;
  let mockApp: App;
  let cachedRead: ReturnType<typeof vi.fn>;
  let getAbstractFileByPath: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    cachedRead = vi
      .fn()
      .mockResolvedValue("# Note\nsome content here for the query");
    getAbstractFileByPath = vi.fn((p: string) => {
      if (p === "folder/note.md") return makeTFile("folder/note.md", 1000);
      return null;
    });

    mockApp = {
      vault: {
        adapter: {
          exists: vi.fn().mockResolvedValue(false),
          list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
          read: vi.fn().mockResolvedValue("{}"),
        },
        getAbstractFileByPath,
        cachedRead,
      },
      metadataCache: {
        getFirstLinkpathDest: vi.fn((p: string) => {
          if (
            p === "folder/note.md" ||
            p === "folder/other.md" ||
            p === "folder/good.md"
          ) {
            return makeTFile(p, 1000);
          }
          return null;
        }),
        fileToLinktext: vi.fn((f: TFile) => f.path),
      },
      plugins: {
        getPlugin: vi.fn(() => null),
      },
    } as unknown as App;

    adapter = new SmartConnectionsAdapter(mockApp);
  });

  afterEach(() => {
    adapter.destroy();
    vi.clearAllMocks();
  });

  describe("semanticQueryCache", () => {
    it("cache miss on first call: reads file", async () => {
      // Trigger buildSemanticQuery indirectly via getRelatedNotes
      // (No SC plugin → falls through to AJSON fallback which also hits adapter.list → empty)
      // We access buildSemanticQuery directly since it's private.
      const query = await (adapter as any).buildSemanticQuery("folder/note.md");

      expect(cachedRead).toHaveBeenCalledTimes(1);
      expect(query).toContain("note");
    });

    it("cache hit on second call with same mtime: no re-read", async () => {
      await (adapter as any).buildSemanticQuery("folder/note.md");
      await (adapter as any).buildSemanticQuery("folder/note.md");

      expect(cachedRead).toHaveBeenCalledTimes(1); // only first call reads
    });

    it("cache miss after mtime change: re-reads file", async () => {
      await (adapter as any).buildSemanticQuery("folder/note.md");

      // Simulate file modification: update mtime
      getAbstractFileByPath.mockImplementation((p: string) => {
        if (p === "folder/note.md") return makeTFile("folder/note.md", 9999);
        return null;
      });

      await (adapter as any).buildSemanticQuery("folder/note.md");

      expect(cachedRead).toHaveBeenCalledTimes(2); // re-read after mtime change
    });

    it("invalidate(path) removes specific cache entry", async () => {
      await (adapter as any).buildSemanticQuery("folder/note.md");
      expect(cachedRead).toHaveBeenCalledTimes(1);

      adapter.invalidate("folder/note.md");

      await (adapter as any).buildSemanticQuery("folder/note.md");
      expect(cachedRead).toHaveBeenCalledTimes(2); // re-read after explicit invalidate
    });

    it("invalidate() with no path clears all entries", async () => {
      await (adapter as any).buildSemanticQuery("folder/note.md");
      expect(cachedRead).toHaveBeenCalledTimes(1);

      adapter.invalidate(); // global clear

      await (adapter as any).buildSemanticQuery("folder/note.md");
      expect(cachedRead).toHaveBeenCalledTimes(2);
    });

    it("destroy() clears cache", async () => {
      await (adapter as any).buildSemanticQuery("folder/note.md");

      adapter.destroy();

      // Internal cache should be empty after destroy
      const cacheSize = (adapter as any).semanticQueryCache.size;
      expect(cacheSize).toBe(0);
    });

    it("returns path when file not found in vault", async () => {
      const result = await (adapter as any).buildSemanticQuery(
        "nonexistent/file.md",
      );
      expect(cachedRead).not.toHaveBeenCalled();
      expect(result).toBe("nonexistent/file.md");
    });
  });

  describe("queryAjsonFallback regression", () => {
    it("skips oversized files via stat bound (pre-read)", async () => {
      const mockVault = mockApp.vault as any;
      mockVault.adapter.exists = vi.fn().mockResolvedValue(true);
      mockVault.adapter.stat = vi
        .fn()
        .mockResolvedValue({ size: 51 * 1024 * 1024 }); // 51MB > 50MB

      const result = await (adapter as any).queryAjsonFallback(
        "folder/note.md",
        5,
      );

      expect(mockVault.adapter.read).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it("tries .ajson when .json exists but is empty", async () => {
      const mockVault = mockApp.vault as any;
      mockVault.adapter.exists = vi.fn().mockResolvedValue(true);
      mockVault.adapter.stat = vi.fn().mockResolvedValue({ size: 2 });
      mockVault.adapter.read = vi.fn().mockImplementation((path: string) => {
        if (path.endsWith(".json")) return "{}";
        if (path.endsWith(".ajson")) {
          return JSON.stringify({
            items: {
              "folder/other.md": { refs: ["folder/note.md"] },
            },
          });
        }
        return "{}";
      });
      mockVault.adapter.list = vi
        .fn()
        .mockResolvedValue({ files: [], folders: [] });

      const result = await (adapter as any).queryAjsonFallback(
        "folder/note.md",
        5,
      );

      expect(mockVault.adapter.read).toHaveBeenCalledWith(
        ".smart-env/smart_sources.json",
      );
      expect(mockVault.adapter.read).toHaveBeenCalledWith(
        ".smart-env/smart_sources.ajson",
      );
      expect(result.length).toBeGreaterThan(0);
    });

    it("survives a single circular entry and continues scanning", async () => {
      const circular: any = { refs: ["folder/note.md"] };
      circular.self = circular; // circular reference

      const mockVault = mockApp.vault as any;
      mockVault.adapter.exists = vi.fn().mockResolvedValue(true);
      mockVault.adapter.stat = vi.fn().mockResolvedValue({ size: 100 });
      mockVault.adapter.read = vi.fn().mockResolvedValue(
        JSON.stringify(
          {
            items: {
              "folder/bad.md": circular,
              "folder/good.md": { refs: ["folder/note.md"] },
            },
          },
          getCircularReplacer(),
        ),
      );
      mockVault.adapter.list = vi
        .fn()
        .mockResolvedValue({ files: [], folders: [] });

      const result = await (adapter as any).queryAjsonFallback(
        "folder/note.md",
        5,
      );

      expect(result.length).toBeGreaterThan(0);
    });

    it("singleFile: stat throws but read succeeds returns parsed data", async () => {
      const mockVault = mockApp.vault as any;
      // Only .ajson exists; .json returns false to avoid double processing
      mockVault.adapter.exists = vi.fn((p: string) => {
        if (p === ".smart-env/smart_sources.ajson") return true;
        if (p === ".smart-env/smart_sources.json") return false;
        return false;
      });
      // stat throws immediately
      mockVault.adapter.stat = vi
        .fn()
        .mockRejectedValue(new Error("stat failed: permission denied"));
      // read returns valid JSON despite stat failure
      mockVault.adapter.read = vi.fn().mockResolvedValue(
        JSON.stringify({
          items: {
            "folder/other.md": { refs: ["folder/note.md"] },
          },
        }),
      );
      mockVault.adapter.list = vi
        .fn()
        .mockResolvedValue({ files: [], folders: [] });

      const result = await (adapter as any).queryAjsonFallback(
        "folder/note.md",
        5,
      );

      // stat failure should be logged and ignored; read still called once
      expect(mockVault.adapter.stat).toHaveBeenCalledTimes(1);
      expect(mockVault.adapter.read).toHaveBeenCalledTimes(1);
      expect(result.length).toBeGreaterThan(0);
    });

    it("multiIndex: filesProcessedButNoSuggestions logs warning", async () => {
      const mockVault = mockApp.vault as any;

      // Mock exists: single-file fallbacks return false; multi-index env exists
      mockVault.adapter.exists = vi.fn((p: string) => {
        if (p === ".smart-env/multi") return true;
        // all other paths (single-file fallbacks, other envs) false
        return false;
      });

      // Mock list: one .ajson file in the env directory
      mockVault.adapter.list = vi.fn().mockResolvedValue({
        files: ["index.ajson"],
        folders: [],
      });

      // Mock stat: small file within limit
      mockVault.adapter.stat = vi.fn().mockResolvedValue({ size: 1024 });

      // Mock read: AJSON without the sourcePath (so containsExactPath returns false)
      mockVault.adapter.read = vi.fn().mockResolvedValue(
        JSON.stringify({
          items: {
            // no entry containing "folder/note.md" → containsExactPath false
            "other/file.md": { refs: ["some/other.md"] },
          },
        }),
      );

      // getFirstLinkpathDest mock from outer mockApp already returns TFile for certain paths —
      // but shouldn't be reached due to containsExactPath fail.

      const result = await (adapter as any).queryAjsonFallback(
        "folder/note.md",
        5,
      );

      // Expect no suggestions
      expect(result).toEqual([]);

      // Warning must be logged because at least one file processed (anyFileProcessed = true) and suggestions empty
      expect(HealerLogger.warn).toHaveBeenCalledTimes(1);
      expect(HealerLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Processed 1 file(s)"),
      );
      expect(HealerLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("folder/note.md"),
      );
    });

    it("returns SearchResult[] objects without link field (Fix 3 typing separation)", async () => {
      const mockVault = mockApp.vault as any;
      mockVault.adapter.exists = vi.fn().mockResolvedValue(true);
      mockVault.adapter.stat = vi.fn().mockResolvedValue({ size: 100 });
      mockVault.adapter.read = vi.fn().mockResolvedValue(
        JSON.stringify({
          items: {
            "folder/other.md": { refs: ["folder/note.md"] },
          },
        }),
      );
      mockVault.adapter.list = vi
        .fn()
        .mockResolvedValue({ files: [], folders: [] });

      const result = await (adapter as any).queryAjsonFallback(
        "folder/note.md",
        5,
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      // Each item must have path and optionally score, but NOT link
      for (const item of result) {
        expect(item).toHaveProperty("path");
        expect(typeof item.path).toBe("string");
        // link must be undefined (not present)
        expect(item).not.toHaveProperty("link");
      }
    });

    it("tolerates malformed JSON in .ajson file and continues to next fallback", async () => {
      const mockVault = mockApp.vault as any;
      // .json exists and is valid; .ajson exists but malformed
      mockVault.adapter.exists = vi.fn((p: string) => {
        return p.endsWith(".json") || p.endsWith(".ajson");
      });
      mockVault.adapter.stat = vi.fn().mockResolvedValue({ size: 100 });
      mockVault.adapter.read = vi.fn(async (path: string) => {
        if (path.endsWith(".json")) {
          return JSON.stringify({
            items: { "folder/other.md": { refs: ["folder/note.md"] } },
          });
        }
        if (path.endsWith(".ajson")) {
          return "not valid json {{{{"; // malformed
        }
        return "{}";
      });
      mockVault.adapter.list = vi
        .fn()
        .mockResolvedValue({ files: [], folders: [] });

      const result = await (adapter as any).queryAjsonFallback(
        "folder/note.md",
        5,
      );

      // Should get results from the .json fallback despite .ajson failure
      expect(result.length).toBeGreaterThan(0);
      // Debug log should have been called for the malformed file
      expect(HealerLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining("not valid JSON"),
        expect.any(Error),
      );
    });
  });
});
