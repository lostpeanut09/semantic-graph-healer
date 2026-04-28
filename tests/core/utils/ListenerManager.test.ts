import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { ListenerManager } from "../../../src/core/utils/ListenerManager";
import { App } from "obsidian";

function createListenerHub() {
  const listeners: Record<string, Function[]> = {};

  return {
    listeners,
    on: vi.fn((name: string, cb: Function) => {
      listeners[name] ??= [];
      listeners[name].push(cb);
      return { name, cb };
    }),
    emit(name: string, ...args: unknown[]) {
      for (const cb of listeners[name] ?? []) cb(...args);
    },
  };
}

describe("ListenerManager", () => {
  let mockApp: App;
  let metadataHub: ReturnType<typeof createListenerHub>;
  let vaultHub: ReturnType<typeof createListenerHub>;
  let mockInvalidate: ReturnType<typeof vi.fn>;
  let manager: ListenerManager;

  beforeEach(() => {
    vi.useFakeTimers();
    metadataHub = createListenerHub();
    vaultHub = createListenerHub();
    mockInvalidate = vi.fn();

    mockApp = {
      metadataCache: {
        on: metadataHub.on,
        offref: vi.fn(),
      },
      vault: {
        on: vaultHub.on,
        offref: vi.fn(),
      },
    } as unknown as App;

    manager = new ListenerManager(
      mockApp,
      mockInvalidate as unknown as () => void,
      250,
    );
  });

  afterEach(() => {
    manager.destroy();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("registers listeners correctly", () => {
    expect(metadataHub.on).toHaveBeenCalledWith(
      "resolve",
      expect.any(Function),
    );
    expect(metadataHub.on).toHaveBeenCalledWith(
      "resolved",
      expect.any(Function),
    );
    expect(metadataHub.on).toHaveBeenCalledWith(
      "deleted",
      expect.any(Function),
    );
    expect(metadataHub.on).toHaveBeenCalledWith(
      "changed",
      expect.any(Function),
    );
    expect(vaultHub.on).toHaveBeenCalledWith("rename", expect.any(Function));
    expect(vaultHub.on).toHaveBeenCalledWith("delete", expect.any(Function));
  });

  it("debounces invalidation events", () => {
    metadataHub.emit("resolve");
    metadataHub.emit("resolved");
    vaultHub.emit("rename");

    // Should not be called immediately
    expect(mockInvalidate).not.toHaveBeenCalled();

    // Advance by less than debounce time
    vi.advanceTimersByTime(100);
    expect(mockInvalidate).not.toHaveBeenCalled();

    // Advance by remaining debounce time
    vi.advanceTimersByTime(150);
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
  });

  it("deregisters listeners on destroy", () => {
    manager.destroy();

    expect(mockApp.metadataCache.offref).toHaveBeenCalledTimes(4);
    expect(mockApp.vault.offref).toHaveBeenCalledTimes(2);

    // Should cancel pending invalidations
    metadataHub.emit("resolve");
    manager.destroy();
    vi.advanceTimersByTime(300);
    expect(mockInvalidate).not.toHaveBeenCalled();
  });
});
