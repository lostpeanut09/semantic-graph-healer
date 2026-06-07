import { describe, it, expect, vi, beforeEach } from "vitest";
import SemanticGraphHealer from "../../src/main";

interface CommandDescriptor {
  id: string;
  name: string;
  callback: () => Promise<void> | void;
}

interface MockPlugin {
  addCommand: ReturnType<typeof vi.fn>;
  api: {
    executeBatch: ReturnType<typeof vi.fn>;
    undoBatch: ReturnType<typeof vi.fn>;
  };
  cache: {
    history: Array<{ id: string; batchId?: string }>;
  };
  logger: {
    error: ReturnType<typeof vi.fn>;
  };
  activateDashboard: ReturnType<typeof vi.fn>;
  activateGraphView: ReturnType<typeof vi.fn>;
  notice: (msg: string) => void;
}

describe("CommandPalette", () => {
  let mockPlugin: MockPlugin;
  let commands: Map<string, CommandDescriptor>;

  beforeEach(() => {
    commands = new Map();
    mockPlugin = {
      addCommand: vi.fn().mockImplementation((cmd: CommandDescriptor) => {
        commands.set(cmd.id, cmd);
      }),
      api: {
        executeBatch: vi.fn(),
        undoBatch: vi.fn(),
      },
      cache: {
        history: [],
      },
      logger: {
        error: vi.fn(),
      },
      activateDashboard: vi.fn(),
      activateGraphView: vi.fn(),
      notice: vi.fn(),
    };

    // Call the method from SemanticGraphHealer prototype bound to mockPlugin
    const registerCommands = (
      SemanticGraphHealer.prototype as unknown as {
        registerCommands: (this: MockPlugin) => void;
      }
    ).registerCommands;
    registerCommands.call(mockPlugin);
  });

  it("should register batch and undo commands", () => {
    expect(commands.has("apply-batch-repairs-high-confidence")).toBe(true);
    expect(commands.has("undo-last-batch-repair")).toBe(true);
  });

  describe("apply-batch-repairs-high-confidence", () => {
    it("should call api.executeBatch with 0.8 confidence", async () => {
      mockPlugin.api.executeBatch.mockResolvedValue({
        appliedCount: 1,
        failedCount: 0,
        batchId: "b1",
      });
      const cmd = commands.get("apply-batch-repairs-high-confidence")!;
      await cmd.callback();
      expect(mockPlugin.api.executeBatch).toHaveBeenCalledWith({
        confidence: 0.8,
      });
    });
  });

  describe("undo-last-batch-repair", () => {
    it("should call api.undoBatch with the last batchId from history", async () => {
      mockPlugin.cache.history = [
        { id: "1", batchId: "batch-old" },
        { id: "2" }, // non-batch item
        { id: "3", batchId: "batch-latest" },
      ];
      mockPlugin.api.undoBatch.mockResolvedValue({
        revertedCount: 1,
        failedCount: 0,
      });

      const cmd = commands.get("undo-last-batch-repair")!;
      await cmd.callback();

      expect(mockPlugin.api.undoBatch).toHaveBeenCalledWith("batch-latest");
    });

    it("should show notice if no batch repairs in history", async () => {
      mockPlugin.cache.history = [{ id: "1" }];
      const cmd = commands.get("undo-last-batch-repair")!;
      await cmd.callback();
      expect(mockPlugin.api.undoBatch).not.toHaveBeenCalled();
    });
  });
});
