import type { App, TAbstractFile, EventRef } from 'obsidian';
import { HealerLogger } from './HealerUtils';

/**
 * StructuralCache
 *
 * Manages an in-memory cache of structural data with LRU (Least Recently Used) eviction
 * and TTL (Time-To-Live) support. Automatically synchronizes with Obsidian's vault
 * events to invalidate entries when files change, are renamed, or deleted.
 *
 * @template T - The type of data stored in the cache.
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

    /**
     * Creates a new instance of StructuralCache.
     *
     * @param app - The Obsidian App instance.
     * @param options - Cache configuration.
     * @param options.maxNodes - Maximum number of entries before LRU eviction (default: 10000).
     * @param options.ttlMs - Time-to-live in milliseconds (default: 5 minutes).
     */
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
        this.changedRef = this.app.metadataCache.on('changed', this.boundInvalidate);
        this.renameRef = this.app.vault.on('rename', this.boundRename);
        this.deleteRef = this.app.vault.on('delete', this.boundInvalidate);
    }

    /**
     * Unregisters all event listeners and clears the cache.
     * Must be called when the cache is no longer needed to prevent memory leaks.
     */
    public destroy(): void {
        this.app.metadataCache.offref(this.changedRef);
        this.app.vault.offref(this.renameRef);
        this.app.vault.offref(this.deleteRef);
        this.cache.clear();
        HealerLogger.debug('StructuralCache listeners unregistered.');
    }

    /**
     * Retrieves an entry from the cache.
     * Refreshes the entry's position for LRU and checks for expiration.
     *
     * @param path - The file path key.
     * @returns The cached value or undefined if not found or expired.
     */
    public get(path: string): T | undefined {
        const entry = this.cache.get(path);
        if (!entry) return undefined;

        const isExpired = Date.now() - entry.timestamp > this.ttlMs;
        if (isExpired) {
            this.invalidate(path);
            return undefined;
        }

        // LRU: Refresh position in Map and update timestamp
        this.cache.delete(path);
        entry.timestamp = Date.now();
        this.cache.set(path, entry);
        return entry.value;
    }

    /**
     * Adds or updates an entry in the cache.
     * Triggers LRU eviction if the cache exceeds maxNodes.
     *
     * @param path - The file path key.
     * @param value - The value to cache.
     */
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

    /**
     * Invalidates a specific cache entry or clears the entire cache.
     *
     * @param path - Optional. The file path to invalidate. If omitted, clears all entries.
     */
    public invalidate(path?: string): void {
        if (path) {
            this.cache.delete(path);
        } else {
            this.cache.clear();
        }
    }

    /**
     * Returns statistics about the current cache state.
     *
     * @returns Object containing current size and max limit.
     */
    public getStats() {
        return {
            size: this.cache.size,
            max: this.maxNodes,
        };
    }
}
