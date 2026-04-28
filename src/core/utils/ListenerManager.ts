import { App, EventRef, TAbstractFile } from "obsidian";

export class ListenerManager {
  private resolveListenerRef: EventRef | null = null;
  private deletedListenerRef: EventRef | null = null;
  private cacheListenerRef: EventRef | null = null;
  private renameListenerRef: EventRef | null = null;
  private changedListenerRef: EventRef | null = null;
  private deleteVaultListenerRef: EventRef | null = null;
  private invalidationTimer: number | null = null;

  constructor(
    private app: App,
    private onInvalidate: () => void,
    private debounceMs: number = 250,
  ) {
    // 'resolve' fires when individual files are resolved
    this.resolveListenerRef = this.app.metadataCache.on("resolve", () => {
      this.scheduleInvalidation();
    });
    // 'resolved' fires when all metadata is fully resolved (global batch complete)
    this.cacheListenerRef = this.app.metadataCache.on("resolved", () => {
      this.scheduleInvalidation();
    });
    // 'deleted' fires when a file is deleted
    this.deletedListenerRef = this.app.metadataCache.on("deleted", () => {
      this.scheduleInvalidation();
    });
    // 'rename' fires when a file is renamed
    this.renameListenerRef = this.app.vault.on(
      "rename",
      (_file: TAbstractFile, _oldPath: string) => {
        this.scheduleInvalidation();
      },
    );
    // When file metadata changes (content edit), invalidate caches.
    this.changedListenerRef = this.app.metadataCache.on("changed", () => {
      this.scheduleInvalidation();
    });
    // When files are deleted, invalidate caches (vault-level event is usually reliable).
    this.deleteVaultListenerRef = this.app.vault.on("delete", () => {
      this.scheduleInvalidation();
    });
  }

  private scheduleInvalidation(): void {
    if (this.invalidationTimer !== null) {
      window.clearTimeout(this.invalidationTimer);
    }
    this.invalidationTimer = window.setTimeout(() => {
      this.onInvalidate();
      this.invalidationTimer = null;
    }, this.debounceMs);
  }

  public destroy(): void {
    if (this.invalidationTimer !== null) {
      window.clearTimeout(this.invalidationTimer);
      this.invalidationTimer = null;
    }
    if (this.resolveListenerRef) {
      this.app.metadataCache.offref(this.resolveListenerRef);
      this.resolveListenerRef = null;
    }
    if (this.cacheListenerRef) {
      this.app.metadataCache.offref(this.cacheListenerRef);
      this.cacheListenerRef = null;
    }
    if (this.deletedListenerRef) {
      this.app.metadataCache.offref(this.deletedListenerRef);
      this.deletedListenerRef = null;
    }
    if (this.renameListenerRef) {
      this.app.vault.offref(this.renameListenerRef);
      this.renameListenerRef = null;
    }
    if (this.changedListenerRef) {
      this.app.metadataCache.offref(this.changedListenerRef);
      this.changedListenerRef = null;
    }
    if (this.deleteVaultListenerRef) {
      this.app.vault.offref(this.deleteVaultListenerRef);
      this.deleteVaultListenerRef = null;
    }
  }
}
