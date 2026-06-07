import { describe, it, expect, vi, beforeEach } from "vitest";
import { EmbeddingService } from "../../src/core/EmbeddingService";
import { requestUrl, type RequestUrlResponse } from "obsidian";
import { DEFAULT_SETTINGS } from "../../src/types";
import type { SemanticGraphHealerSettings } from "../../src/types";

vi.mock("obsidian", () => ({
  requestUrl: vi.fn(),
}));

describe("EmbeddingService", () => {
  let service: EmbeddingService;
  let mockSettings: SemanticGraphHealerSettings;

  beforeEach(() => {
    mockSettings = {
      ...DEFAULT_SETTINGS,
      embeddingProvider: "ollama",
      embeddingModel: "nomic-embed-text",
      embeddingEndpoint: "http://localhost:11434",
      embeddingDimensions: 768,
    };
    service = new EmbeddingService(mockSettings);
    vi.clearAllMocks();
  });

  it("should fetch embedding from Ollama correctly", async () => {
    const mockVector = new Array(768).fill(0.1);
    vi.mocked(requestUrl).mockResolvedValueOnce({
      status: 200,
      json: {
        embedding: mockVector,
      },
    } as unknown as RequestUrlResponse);

    const result = await service.getEmbedding("test text");

    expect(requestUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://localhost:11434/api/embeddings",
        method: "POST",
        body: expect.stringContaining('"prompt":"test text"'),
      }),
    );
    expect(result).toEqual(mockVector);
  });

  it("should fetch embedding from OpenAI/LocalAI correctly", async () => {
    mockSettings.embeddingProvider = "openai";
    mockSettings.embeddingEndpoint = "http://localhost:8080";
    const mockVector = new Array(768).fill(0.2);

    vi.mocked(requestUrl).mockResolvedValueOnce({
      status: 200,
      json: {
        data: [{ embedding: mockVector }],
      },
    } as unknown as RequestUrlResponse);

    const result = await service.getEmbedding("test text");

    expect(requestUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "http://localhost:8080/v1/embeddings",
        method: "POST",
        body: expect.stringContaining('"input":"test text"'),
      }),
    );
    expect(result).toEqual(mockVector);
  });

  it("should retry on failure", async () => {
    vi.mocked(requestUrl)
      .mockResolvedValueOnce({ status: 500 } as unknown as RequestUrlResponse)
      .mockResolvedValueOnce({
        status: 200,
        json: { embedding: new Array(768).fill(0.3) },
      } as unknown as RequestUrlResponse);

    const result = await service.getEmbedding("retry test");

    expect(requestUrl).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(768);
  });

  it("should throw error after max retries", async () => {
    vi.mocked(requestUrl).mockResolvedValue({
      status: 500,
    } as unknown as RequestUrlResponse);

    await expect(service.getEmbedding("fail test")).rejects.toThrow();
    expect(requestUrl).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });
});
