import { describe, it, expect, vi, beforeEach } from "vitest";
import { GraphRagService } from "../../../src/core/services/GraphRagService";
import { AjsonStorage } from "../../../src/core/utils/AjsonStorage";

vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
  TFile: class {},
}));

describe("GraphRagService Indexing", () => {
  let service: GraphRagService;
  let mockGraphEngine: {
    getCacheStatus: ReturnType<typeof vi.fn>;
    getGraph: ReturnType<typeof vi.fn>;
    getTopologicalMetrics: ReturnType<typeof vi.fn>;
    context: {
      cache: { topologicalScores: { communities: Record<string, number> } };
    };
  };
  let mockLlmService: { callLlm: ReturnType<typeof vi.fn> };
  let mockEmbeddingService: { getEmbedding: ReturnType<typeof vi.fn> };
  let mockStorage: AjsonStorage;
  let mockAdapter: {
    exists: ReturnType<typeof vi.fn>;
    append: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    mkdir: ReturnType<typeof vi.fn>;
  };
  let mockSettings: Record<string, unknown>;

  beforeEach(() => {
    mockGraphEngine = {
      getCacheStatus: vi.fn().mockReturnValue({ valid: true }),
      getGraph: vi.fn().mockReturnValue({
        nodes: vi.fn().mockReturnValue(["note1.md", "note2.md", "note3.md"]),
      }),
      getTopologicalMetrics: vi.fn().mockReturnValue({
        communities: {
          "note1.md": 1,
          "note2.md": 1,
          "note3.md": 2,
        },
      }),
      context: {
        cache: {
          topologicalScores: {
            communities: {
              "note1.md": 1,
              "note2.md": 1,
              "note3.md": 2,
            },
          },
        },
      },
    };

    mockLlmService = {
      callLlm: vi.fn().mockResolvedValue("Summary for community"),
    };

    mockEmbeddingService = {
      getEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    };

    mockAdapter = {
      exists: vi.fn().mockResolvedValue(true),
      append: vi.fn().mockResolvedValue(undefined),
      write: vi.fn().mockResolvedValue(undefined),
      read: vi.fn().mockResolvedValue(""),
      mkdir: vi.fn().mockResolvedValue(undefined),
    };

    const StorageCtor = AjsonStorage as unknown as new (
      ...args: unknown[]
    ) => AjsonStorage;
    mockStorage = new StorageCtor(mockAdapter);
    mockSettings = {
      graphRagIndexDir: ".planning/index",
    };

    const GRS = GraphRagService as unknown as new (
      ...args: unknown[]
    ) => GraphRagService;
    service = new GRS(
      mockGraphEngine,
      mockLlmService,
      mockEmbeddingService,
      mockStorage,
      mockAdapter,
      mockSettings,
    );
  });

  it("should generate summaries and embeddings for communities", async () => {
    await service.indexCommunities();

    // 2 communities (1 and 2)
    expect(mockLlmService.callLlm).toHaveBeenCalledTimes(2);
    expect(mockEmbeddingService.getEmbedding).toHaveBeenCalledTimes(2);
    // Should write to .planning/index/community_summaries.ajson
    expect(mockAdapter.write).toHaveBeenCalled();
  });
});
