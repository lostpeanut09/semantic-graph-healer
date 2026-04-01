import { App, TFile } from 'obsidian';
import { HealerLogger } from './HealerUtils';

/**
 * StructuralCache: SOTA 2026 Performance Layer.
 * Implements LRU (Least Recently Used) eviction to prevent memory bloat on mobile.
 */

export class StructuralCache<T> {
    private cache: Map<string, { value: T; timestamp: number }> = new Map();
    private maxNodes: number;
    private ttlMs: number;

    private boundInvalidate: (file: TFile) => void;
    private boundRename: (file: TFile, oldPath: string) => void;

    constructor(
        private app: App,
        options: { maxNodes?: number; ttlMs?: number } = {},
    ) {
        this.maxNodes = options.maxNodes || 10000;
        this.ttlMs = options.ttlMs || 300000; // 5 minutes default

        // Event-based Invalidation (Bound for unregistration)
        this.boundInvalidate = (file: TFile) => this.invalidate(file.path);
        this.boundRename = (file: TFile) => this.invalidate(file.path);

        this.app.metadataCache.on('changed', this.boundInvalidate);
        this.app.vault.on('rename', this.boundRename);
        this.app.vault.on('delete', this.boundInvalidate);
    }

    /**
     * ✅ NEW: Explicit cleanup to prevent memory leaks from global event listeners.
     */
    public destroy(): void {
        this.app.metadataCache.off('changed', this.boundInvalidate);
        this.app.vault.off('rename', this.boundRename);
        this.app.vault.off('delete', this.boundInvalidate);
        this.cache.clear();
        HealerLogger.debug('StructuralCache listeners unregistered.');
    }

    public get(path: string): T | null {
        const entry = this.cache.get(path);
        if (!entry) return null;

        const isExpired = Date.now() - entry.timestamp > this.ttlMs;
        if (isExpired) {
            this.invalidate(path);
            return null;
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
