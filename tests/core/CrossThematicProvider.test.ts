import { describe, it, expect, vi, beforeEach } from "vitest";
import { CrossThematicProvider } from "../../src/core/services/CrossThematicProvider";
import { DEFAULT_SETTINGS } from "../../src/types";

describe("CrossThematicProvider", () => {
  let provider: CrossThematicProvider;
  let mockGraphEngine: any;
  let mockStorage: any;
  let mockSettings: any;

  beforeEach(() => {
    mockGraphEngine = {
      getTopologicalMetrics: vi.fn(),
    };
    mockStorage = {
      readAll: vi.fn(),
    };
    mockSettings = {
      ...DEFAULT_SETTINGS,
      graphRagIndexDir: ".planning/index",
    };
    provider = new CrossThematicProvider(
      mockGraphEngine,
      mockStorage,
      mockSettings,
    );
  });

  it("should return empty suggestions if fewer than 2 communities exist", async () => {
    mockStorage.readAll.mockResolvedValueOnce([{ communityId: 1 }]);
    const suggestions = await provider.getSuggestions();
    expect(suggestions).toEqual([]);
  });

  it("should suggest bridges for semantically similar communities", async () => {
    const mockSummaries = [
      {
        communityId: 1,
        summary: "Artificial Intelligence",
        embedding: [1, 0, 0],
        notes: ["note1.md"],
      },
      {
        communityId: 2,
        summary: "Machine Learning",
        embedding: [0.9, 0.1, 0], // High similarity to [1, 0, 0]
        notes: ["note2.md"],
      },
      {
        communityId: 3,
        summary: "Cooking Recipes",
        embedding: [0, 1, 0], // Low similarity
        notes: ["note3.md"],
      },
    ];

    mockStorage.readAll.mockResolvedValueOnce(mockSummaries);

    const suggestions = await provider.getSuggestions();

    expect(suggestions.length).toBe(1);
    expect(suggestions[0].type).toBe("semantic_inference");
    expect(suggestions[0].meta.sourcePath).toBe("note1.md");
    expect(suggestions[0].meta.targetPath).toBe("note2.md");
    expect(suggestions[0].source).toContain("99.4%");
  });

  it("should handle empty or missing note paths gracefully", async () => {
    const mockSummaries = [
      {
        communityId: 1,
        summary: "A",
        embedding: [1, 0],
        notes: [],
      },
      {
        communityId: 2,
        summary: "B",
        embedding: [0.9, 0.1],
        notes: ["note2.md"],
      },
    ];

    mockStorage.readAll.mockResolvedValueOnce(mockSummaries);
    const suggestions = await provider.getSuggestions();
    expect(suggestions).toEqual([]);
  });
});
