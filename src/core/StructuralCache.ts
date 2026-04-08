import { App, TAbstractFile, TFile, EventRef } from 'obsidian';
import { HealerLogger } from './HealerUtils';

/**
 * StructuralCache
 * Implements LRU (Least Recently Used) eviction to prevent memory bloat on mobile.
 */

export class StructuralCache<T> {
    private cache: Map<string, { value: T; timestamp: number }> = new Map();
    private maxNodes: number;
    private ttlMs: number;

    private boundInvalidate: (file: TAbstractFile) => void;
    private boundRename: (file: TAbstractFile, oldPath: string) => void;

    private changedRef: EventRef;
    private renameRef: EventRef;
    private deleteRef: EventRef;

    constructor(
        private app: App,
        options: { maxNodes?: number; ttlMs?: number } = {},
    ) {
        this.maxNodes = options.maxNodes || 10000;
        this.ttlMs = options.ttlMs || 300000; // 5 minutes default

        // Event-based Invalidation
        this.boundInvalidate = (file: TAbstractFile) => this.invalidate(file.path);
        this.boundRename = (file: TAbstractFile, oldPath: string) => {
            this.invalidate(oldPath);
            this.invalidate(file.path);
        };
        this.changedRef = this.app.metadataCache.on(
            'changed',
            this.boundInvalidate as unknown as (file: TFile) => void,
        );
        this.renameRef = this.app.vault.on('rename', this.boundRename);
        this.deleteRef = this.app.vault.on('delete', this.boundInvalidate);
    }

    /**
     * ✅ NEW: Explicit cleanup to prevent memory leaks from global event listeners.
     */
    public destroy(): void {
        this.app.metadataCache.offref(this.changedRef);
        this.app.vault.offref(this.renameRef);
        this.app.vault.offref(this.deleteRef);
        this.cache.clear();
        HealerLogger.debug('StructuralCache listeners unregistered.');
    }

    public get(path: string): T | undefined {
        const entry = this.cache.get(path);
        if (!entry) return undefined;

        const isExpired = Date.now() - entry.timestamp > this.ttlMs;
        if (isExpired) {
            this.invalidate(path);
            return undefined;
        }

        // LRU: Refresh position in Map by deleting and re-inserting
        this.cache.delete(path);
        this.cache.set(path, entry);
        return entry.value;
    }

    public set(path: string, value: T): void {
        if (this.cache.size >= this.maxNodes) {
            // Evict oldest entry (the first key in Map)
            const oldestKey = this.cache.keys().next().value as string | undefined;
            if (oldestKey !== undefined) {
                this.cache.delete(oldestKey);
                HealerLogger.debug(`Cache: Evicted ${oldestKey} (LRU)`);
            }
        }

        this.cache.set(path, {
            value,
            timestamp: Date.now(),
        });
    }

    public invalidate(path?: string): void {
        if (path) {
            this.cache.delete(path);
        } else {
            this.cache.clear();
        }
    }

    public getStats() {
        return {
            size: this.cache.size,
            max: this.maxNodes,
        };
    }
}
