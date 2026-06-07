import { describe, it, expect, vi, beforeEach } from "vitest";
import { CrossThematicProvider } from "../../../src/core/services/CrossThematicProvider";
import { DEFAULT_SETTINGS } from "../../../src/types";
import type { GraphEngine } from "../../../src/core/GraphEngine";
import type { AjsonStorage } from "../../../src/core/utils/AjsonStorage";
import type { SemanticGraphHealerSettings } from "../../../src/types";

describe("CrossThematicProvider", () => {
  let provider: CrossThematicProvider;
  let mockGraphEngine: GraphEngine;
  let mockStorage: AjsonStorage;
  let mockSettings: SemanticGraphHealerSettings;

  beforeEach(() => {
    mockGraphEngine = {
      getTopologicalMetrics: vi.fn(),
    } as unknown as GraphEngine;
    mockStorage = {
      getThemeMetadata: vi.fn(),
      saveThemeMetadata: vi.fn(),
    } as unknown as AjsonStorage;
    mockSettings = { ...DEFAULT_SETTINGS };

    provider = new CrossThematicProvider(
      mockGraphEngine,
      mockStorage,
      mockSettings,
    );
  });

  it("should be initialized with correct settings", () => {
    expect(provider).toBeDefined();
  });
});
