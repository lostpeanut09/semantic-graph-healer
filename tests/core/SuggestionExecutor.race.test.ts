import { describe, it, expect, vi, beforeEach } from "vitest";
import { SuggestionExecutor } from "../../src/core/SuggestionExecutor";
import { TFile } from "obsidian";
import type { ExecutionContext } from "../../src/core/services/PluginContext";
import type { Suggestion } from "../../src/types";

vi.mock("obsidian", () => ({
  TFile: class {
    path: string = "";
    basename: string = "";
    extension: string = "";
  },
  Notice: vi.fn(),
}));

describe("SuggestionExecutor Race Condition Test", () => {
  let executor: SuggestionExecutor;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = {
      app: {
        vault: {
          getAbstractFileByPath: vi.fn(),
        },
        fileManager: {
          processFrontMatter: vi.fn().mockImplementation(async (file, cb) => {
            await new Promise((resolve) => setTimeout(resolve, 50)); // Artificial delay
            await cb({});
          }),
        },
      },
      cache: { suggestions: [], pushHistory: vi.fn() },
      saveSettings: vi.fn(),
      refreshDashboard: vi.fn(),
      notifier: {
        show: vi.fn(),
      },
    } as unknown as ExecutionContext;
    executor = new SuggestionExecutor(mockContext);
  });

  it("should handle concurrent executions of the same link operation without corruption", async () => {
    const suggestion: Suggestion = {
      id: "1",
      source: "Bridge",
      type: "bridge",
      link: "B.md",
      meta: {
        sourcePath: "A.md",
        targetPath: "B.md",
        winner: "C.md",
        property: "next",
      },
    } as unknown as Suggestion;

    const fileA = new TFile();
    fileA.path = "A.md";
    (
      mockContext.app.vault.getAbstractFileByPath as ReturnType<typeof vi.fn>
    ).mockReturnValue(fileA);
    (mockContext.app as unknown as { metadataCache: unknown }).metadataCache = {
      getFileCache: vi.fn().mockReturnValue({ frontmatter: {} }),
      getFirstLinkpathDest: vi.fn().mockReturnValue(fileA),
      fileToLinktext: vi.fn().mockReturnValue("A.md"),
    };

    // Fire two identical relink operations concurrently
    const results = await Promise.all([
      executor.executeRelink(suggestion),
      executor.executeRelink(suggestion),
    ]);

    // Expect both to succeed (or handle concurrent state)
    expect(results[0]).toBe(true);
    expect(results[1]).toBe(true);
    expect(mockContext.app.fileManager.processFrontMatter).toHaveBeenCalled();
    expect(
      (
        mockContext.app.fileManager.processFrontMatter as ReturnType<
          typeof vi.fn
        >
      ).mock.calls.length,
    ).toBeGreaterThanOrEqual(2);
  });
});
