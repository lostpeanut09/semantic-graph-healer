import { describe, it, expect, vi, beforeEach } from "vitest";
import { LadybugService } from "../../src/core/services/LadybugService";
import { LadybugAdapter } from "../../src/core/adapters/LadybugAdapter";
import { UnifiedMetadataAdapter } from "../../src/core/adapters/UnifiedMetadataAdapter";
import type { App } from "obsidian";
import type { ExtendedManifest } from "../../src/types";

type MockNode = { path: string };
type MockLink = { from: string; to: string };
type MockMsg = {
  type: string;
  query?: string;
  algoName?: string;
  batch?: Array<{ type: string; data: unknown[] }>;
};

// Enhanced Mock Worker that simulates the internal state of the worker
class MockWorker {
  onmessage: ((ev: MessageEvent) => unknown) | null = null;
  handlers: Set<(ev: MessageEvent) => unknown> = new Set();
  nodes: MockNode[] = [];
  links: MockLink[] = [];

  addEventListener(_type: string, handler: (ev: MessageEvent) => unknown) {
    this.handlers.add(handler);
  }

  removeEventListener(_type: string, handler: (ev: MessageEvent) => unknown) {
    this.handlers.delete(handler);
  }

  postMessage(msg: unknown) {
    const m = msg as MockMsg;
    // Simulate asynchronous worker response
    setTimeout(() => {
      if (m.type === "init") {
        this.dispatchEvent({ type: "init-progress", progress: 50 });
        setTimeout(
          () => this.dispatchEvent({ type: "ready", mode: "st-wasm" }),
          10,
        );
      } else if (m.type === "sync") {
        m.batch?.forEach((item) => {
          if (item.type === "node")
            this.nodes.push(...(item.data as MockNode[]));
          if (item.type === "link")
            this.links.push(...(item.data as MockLink[]));
        });
        this.dispatchEvent({ type: "sync-complete" });
      } else if (m.type === "query") {
        // Simple Cypher simulator for E2E verification
        let rows: unknown[] = [];
        if (m.query?.includes("SIZE([ (n)-[]->() | n ]) = 0")) {
          // Find Black Holes (nodes with no out-links)
          const nodePathsWithOutLinks = new Set(this.links.map((l) => l.from));
          rows = this.nodes
            .filter((n) => !nodePathsWithOutLinks.has(n.path))
            .map((n) => ({ path: n.path }));
        } else if (
          m.query?.includes("MATCH (a:Node)-[r1]->(b:Node)-[r2]->(c:Node)")
        ) {
          // Find Bridges
          rows = [{ path: "bridge.md" }];
        }
        this.dispatchEvent({ type: "query-result", rows });
      } else if (m.type === "algo") {
        const result =
          m.algoName === "pagerank" ? { "a.md": 0.1 } : { "a.md": 0 };
        this.dispatchEvent({ type: "algo-result", result });
      }
    }, 10);
  }

  dispatchEvent(data: unknown) {
    const ev = { data } as MessageEvent;
    this.onmessage?.(ev);
    this.handlers.forEach((h) => h(ev));
  }

  terminate() {}
}

global.Worker = MockWorker as unknown as typeof global.Worker;

describe("Ladybug E2E Flow", () => {
  let service: LadybugService;
  let metadataAdapter: UnifiedMetadataAdapter;
  let ladybugAdapter: LadybugAdapter;

  beforeEach(() => {
    const mockApp = {
      vault: {
        adapter: {
          read: vi.fn().mockResolvedValue("// mock worker content"),
        },
      },
    } as unknown as App;
    const mockManifest = { dir: "plugin-dir" } as unknown as ExtendedManifest;

    service = new LadybugService(mockApp, mockManifest);
    metadataAdapter = {
      getLinksSafe: vi.fn().mockResolvedValue([
        {
          sourcePath: "node1.md",
          targetPath: "node2.md",
          type: "related",
          confidence: 1.0,
        },
      ]),
      queryPages: vi
        .fn()
        .mockResolvedValue([
          { file: { path: "node1.md", name: "Node 1", size: 100 } },
          { file: { path: "node2.md", name: "Node 2", size: 200 } },
        ]),
    } as unknown as UnifiedMetadataAdapter;
    ladybugAdapter = new LadybugAdapter(service, metadataAdapter);
  });

  it("successfully performs a full analysis cycle", async () => {
    // 1. Initialization & Ingestion
    await ladybugAdapter.initialize();
    expect(service.initializationStatus).toBe("ready");

    // 2. Verify Data Ingestion (via Query)
    // Note: Our mock simulator handles the 'Black Hole' query
    // node2.md has no out-links, so it should be a black hole
    const blackHoles = await ladybugAdapter.findBlackHoles(0);
    expect(blackHoles.map((b) => b.path)).toContain("node2.md");
    expect(blackHoles.map((b) => b.path)).not.toContain("node1.md");

    // 3. Verify Algorithms
    const pagerank = await ladybugAdapter.getPageRank();
    expect(pagerank).toHaveProperty("a.md");

    // 4. Verify Lifecycle
    service.terminate();
    expect(service.initializationStatus).toBe("none");
  });
});
