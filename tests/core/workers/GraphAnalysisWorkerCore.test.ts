import { describe, it, expect, vi } from "vitest";
import {
  handleGraphWorkerMessage,
  createProgressReporter,
  ProgressReporter,
  WorkerMessage,
} from "../../../src/core/workers/graph-analysis-core";

describe("GraphAnalysisWorkerCore", () => {
  const mockReporter: ProgressReporter = {
    postProgress: vi.fn(),
  };

  const basePayload = {
    nodes: [
      { key: "A", attributes: {} },
      { key: "B", attributes: {} },
      { key: "C", attributes: {} },
    ],
    edges: [
      { source: "A", target: "B", attributes: {} },
      { source: "B", target: "C", attributes: {} },
    ],
    requestId: "test-req",
  };

  describe("Basic Algorithms", () => {
    it("should compute PageRank correctly", () => {
      const message: WorkerMessage = {
        type: "PAGERANK",
        payload: basePayload,
      };

      const response = handleGraphWorkerMessage(message, mockReporter);
      expect(response.type).toBe("RESULT");
      expect(response.payload.data).toBeDefined();
      const data = response.payload.data as Record<string, number>;
      expect(data["A"]).toBeGreaterThan(0);
    });

    it("should compute Communities (Louvain) correctly", () => {
      const message: WorkerMessage = {
        type: "COMMUNITY",
        payload: basePayload,
      };

      const response = handleGraphWorkerMessage(message, mockReporter);
      expect(response.type).toBe("RESULT");
      const data = response.payload.data as Record<string, number>;
      expect(data["A"]).toBeDefined();
    });
  });

  describe("Guardrails", () => {
    it("should throw error if graph is too dense (Max Edges)", () => {
      const message: WorkerMessage = {
        type: "BETWEENNESS",
        payload: basePayload,
        options: { maxEdges: 1 }, // limit is 1, we have 2 edges
      };

      const response = handleGraphWorkerMessage(message, mockReporter);
      expect(response.type).toBe("ERROR");
      expect(response.payload.message).toContain("Graph too dense");
    });

    it("should throw error if graph is too large for specific algorithm (Max Nodes)", () => {
      const message: WorkerMessage = {
        type: "BETWEENNESS",
        payload: basePayload,
        options: { maxNodes: 2 }, // limit is 2, we have 3 nodes
      };

      const response = handleGraphWorkerMessage(message, mockReporter);
      expect(response.type).toBe("ERROR");
      expect(response.payload.message).toContain("Graph too large");
    });
  });

  describe("Edge Policies", () => {
    const payloadWithMissingNodes = {
      nodes: [{ key: "A", attributes: {} }],
      edges: [{ source: "A", target: "B", attributes: {} }], // B is missing
      requestId: "test-req",
    };

    it("should throw error in strict mode if node is missing", () => {
      const message: WorkerMessage = {
        type: "PAGERANK",
        payload: payloadWithMissingNodes,
        options: { edgePolicy: "strict" },
      };

      const response = handleGraphWorkerMessage(message, mockReporter);
      expect(response.type).toBe("ERROR");
      expect(response.payload.message).toContain("Missing target node: B");
    });

    it("should create missing node in tolerant mode", () => {
      const message: WorkerMessage = {
        type: "PAGERANK",
        payload: payloadWithMissingNodes,
        options: { edgePolicy: "tolerant" },
      };

      const response = handleGraphWorkerMessage(message, mockReporter);
      expect(response.type).toBe("RESULT");
    });
  });

  describe("Fail-Closed and Error Handling", () => {
    it("should return ERROR for unknown message types", () => {
      const message = {
        type: "UNKNOWN_TYPE",
        payload: basePayload,
      } as unknown as WorkerMessage;

      const response = handleGraphWorkerMessage(message, mockReporter);
      expect(response.type).toBe("ERROR");
      expect(response.payload.message).toContain(
        "Unsupported graph worker message type",
      );
    });

    it("should handle malformed payloads gracefully", () => {
      const message = {
        type: "PAGERANK",
        payload: { ...basePayload, nodes: null },
      } as unknown as WorkerMessage;

      const response = handleGraphWorkerMessage(message, mockReporter);
      expect(response.type).toBe("ERROR");
      expect(response.payload.message).toBeDefined();
    });
  });

  describe("Advanced Analysis with Progress", () => {
    it("should report progress for Similarity analysis", async () => {
      const message: WorkerMessage = {
        type: "SIMILARITY",
        payload: {
          ...basePayload,
          // Add more nodes to trigger progress report (every 50 processed nodes)
          nodes: Array.from({ length: 60 }, (_, i) => ({
            key: `node-${i}`,
            attributes: {},
          })),
          edges: [],
        },
      };

      handleGraphWorkerMessage(message, mockReporter);
      expect(mockReporter.postProgress).toHaveBeenCalled();
    });

    it("should compute Co-citation correctly", () => {
      const message: WorkerMessage = {
        type: "COCITATION",
        payload: basePayload,
      };

      const response = handleGraphWorkerMessage(message, mockReporter);
      expect(response.type).toBe("RESULT");
    });

    it("should compute Full Analysis correctly", () => {
      const message: WorkerMessage = {
        type: "FULL_ANALYSIS",
        payload: basePayload,
      };

      const response = handleGraphWorkerMessage(message, mockReporter);
      expect(response.type).toBe("RESULT");
    });
  });

  describe("Factory: createProgressReporter", () => {
    it("should create a reporter that calls the postMessage callback", () => {
      const postMessageFn = vi.fn();
      const reporter = createProgressReporter(postMessageFn);

      reporter.postProgress("req-1", 50, "Processing...");

      expect(postMessageFn).toHaveBeenCalledWith({
        type: "PROGRESS",
        payload: {
          requestId: "req-1",
          data: { pct: 50, message: "Processing..." },
        },
      });
    });
  });
});
