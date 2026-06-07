// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import type { HealerLogger as HealerLoggerType } from "../../../src/core/utils/HealerLogger";
import type { SemanticGraphHealerSettings } from "../../../src/types";

// Mocks
vi.mock("../../../src/core/utils/HealerLogger", () => ({
  HealerLogger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const { mockPlatform, mockWorker } = vi.hoisted(() => ({
  mockPlatform: { isMobile: false },
  mockWorker: {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null as ((ev: MessageEvent) => void) | null,
    onerror: null as ((ev: ErrorEvent) => void) | null,
  },
}));

vi.mock("obsidian", () => ({
  App: class MockApp {},
  Platform: mockPlatform,
}));

global.Worker = class MockWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: ErrorEvent) => void) | null = null;
  postMessage() {}
  terminate() {
    mockWorker.terminate();
  }
} as unknown as typeof Worker;
if (!global.URL) {
  global.URL = {} as unknown as typeof URL;
}
global.URL.createObjectURL = vi.fn(() => "blob:mock-worker-url");
global.URL.revokeObjectURL = vi.fn();

vi.mock("../../../src/core/workers/graph-analysis-core", () => ({
  handleGraphWorkerMessage: vi.fn(
    (message: { payload?: { requestId?: string } }) => ({
      type: "RESULT",
      payload: {
        data: { success: true },
        requestId: message.payload?.requestId,
      },
    }),
  ),
}));

import { GraphWorkerService } from "../../../src/core/services/GraphWorkerService";
import { HealerLogger } from "../../../src/core/utils/HealerLogger";
import { handleGraphWorkerMessage } from "../../../src/core/workers/graph-analysis-core";

const mockNotifier = {
  show: vi.fn(),
};

interface MockPlugin {
  manifest: { dir: string };
  app: App;
  settings: SemanticGraphHealerSettings;
}

function makePlugin(): MockPlugin {
  return {
    manifest: { dir: "/mock/dir" },
    app: {
      vault: {
        adapter: {
          read: vi.fn().mockResolvedValue('console.log("worker mock");'),
        },
      },
    } as unknown as App,
    settings: { workerTimeout: 120 } as unknown as SemanticGraphHealerSettings,
  };
}

describe("GraphWorkerService", () => {
  afterEach(() => {
    vi.clearAllMocks();
    mockPlatform.isMobile = false;
  });

  describe("terminate() CRIT-2", () => {
    it("rejects all pending promises before clearing", async () => {
      const plugin = makePlugin();
      const loggerMock = {
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as HealerLogger;
      const service = new GraphWorkerService(loggerMock, plugin, mockNotifier);

      await service.initialize();

      // Trigger a pending request
      const promise = service.runAnalysis("SIMILARITY", [], [], {});

      // Call terminate
      service.terminate();

      // Ensure the promise is rejected immediately
      await expect(promise).rejects.toThrow(/Worker terminated/);

      // Check memory cleanup
      expect(mockWorker.terminate).toHaveBeenCalled();
      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(
        "blob:mock-worker-url",
      );
    });
  });

  describe("initialize() race-lock", () => {
    it("uses the same initialization promise for parallel calls", async () => {
      const plugin = makePlugin();
      const loggerMock = {
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as HealerLogger;
      const service = new GraphWorkerService(loggerMock, plugin, mockNotifier);

      // Spy on worker creation
      const workerSpy = vi.spyOn(global, "Worker");

      // Call initialize multiple times concurrently
      const p1 = service.initialize();
      const p2 = service.initialize();
      const p3 = service.initialize();

      await Promise.all([p1, p2, p3]);

      // Ensure adapter.read and Worker constructor were called only once
      expect(plugin.app.vault.adapter.read).toHaveBeenCalledTimes(1);
      expect(workerSpy).toHaveBeenCalledTimes(1);

      workerSpy.mockRestore();
    });
  });

  describe("initialize() MED-1", () => {
    it("revokes blob URL if Worker constructor fails", async () => {
      const plugin = makePlugin();
      const loggerMock = {
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as HealerLogger;
      const service = new GraphWorkerService(loggerMock, plugin, mockNotifier);

      const originalWorker = global.Worker;
      global.Worker = class {
        constructor() {
          throw new Error("Worker constructor crash");
        }
      } as unknown as typeof Worker;

      try {
        await service.initialize();
      } finally {
        global.Worker = originalWorker;
      }

      expect(global.URL.revokeObjectURL).toHaveBeenCalledWith(
        "blob:mock-worker-url",
      );
      // Can't check private field .workerUrl easily, but the revoke logic is what matters
    });
  });

  describe("handleWorkerError (fail-fast)", () => {
    it("rejects pending requests immediately upon worker error", async () => {
      const plugin = makePlugin();
      const loggerMock = {
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as HealerLogger;
      const service = new GraphWorkerService(loggerMock, plugin, mockNotifier);

      await service.initialize();

      // Trigger a pending request
      const promise = service.runAnalysis("SIMILARITY", [], [], {});

      // Simulate worker throwing an error event
      const workerInstance = (service as unknown as { worker: Worker | null })
        .worker;

      if (workerInstance && workerInstance.onerror) {
        workerInstance.onerror({
          message: "Fatal exception in thread",
          filename: "worker.js",
          lineno: 42,
        } as unknown as ErrorEvent);
      }

      // Ensure the promise is rejected immediately due to fail-fast
      await expect(promise).rejects.toThrow(/Worker error: Fatal exception/);
    });
  });

  describe("mobile fallback", () => {
    it("runs analysis on main thread with node truncation and edge filtering", async () => {
      const plugin = makePlugin();
      const loggerMock = {
        info: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as HealerLogger;
      const service = new GraphWorkerService(loggerMock, plugin, mockNotifier);

      mockPlatform.isMobile = true;
      await service.initialize();

      // Setup global.requestIdleCallback for jsdom if needed
      if (!global.requestIdleCallback) {
        global.requestIdleCallback = (cb: IdleRequestCallback) =>
          setTimeout(
            () => cb({ didTimeout: false, timeRemaining: () => 0 }),
            0,
          ) as unknown as number;
      }

      // Create 250 nodes
      const nodes = Array.from({ length: 250 }, (_, i) => ({
        key: `n${i}`,
        attributes: {},
      }));
      // Edges:
      // 1. Valid (within first 200)
      // 2. Cross-boundary (source in 200, target out) -> should be filtered
      // 3. Invalid (both out) -> should be filtered
      const edges = [
        { source: "n0", target: "n1", attributes: {} },
        { source: "n10", target: "n210", attributes: {} },
        { source: "n210", target: "n220", attributes: {} },
      ];

      const promise = service.runAnalysis("SIMILARITY", nodes, edges, {});
      const result = await promise;

      expect(mockNotifier.show).toHaveBeenCalledWith(
        expect.stringContaining(
          "Running graph analysis on main thread (limited to 200 nodes)",
        ),
      );

      // Verify truncation and filtering via handleGraphWorkerMessage call
      expect(handleGraphWorkerMessage).toHaveBeenCalled();
      const lastCall = (
        handleGraphWorkerMessage as unknown as { mock: { calls: unknown[][] } }
      ).mock.calls.at(-1)?.[0] as {
        payload: {
          nodes: { key: string }[];
          edges: { source: string; target: string; attributes: object }[];
        };
      };

      // Should be exactly 200 nodes
      expect(lastCall.payload.nodes.length).toBe(200);
      expect(lastCall.payload.nodes[199].key).toBe("n199");

      // Should be only 1 edge (n0 -> n1)
      expect(lastCall.payload.edges.length).toBe(1);
      expect(lastCall.payload.edges[0]).toEqual({
        source: "n0",
        target: "n1",
        attributes: {},
      });

      expect(result).toBeDefined();
    });
  });
});
