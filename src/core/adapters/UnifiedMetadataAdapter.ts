import { App, debounce, Notice, TFile } from 'obsidian';
import type { IMetadataAdapter } from './IMetadataAdapter';
import { DatacoreAdapter } from './DatacoreAdapter';
import { BreadcrumbsAdapter } from './BreadcrumbsAdapter';
import { SmartConnectionsAdapter } from './SmartConnectionsAdapter';
import { NativeVaultAdapter } from './NativeVaultAdapter';
import { BaseAdapter } from './BaseAdapter';
import { SemanticLinkEdge } from './types';
import type { IDataviewPort } from '../ports/IDataviewPort';
import type { IBreadcrumbsPort } from '../ports/IBreadcrumbsPort';
import type { ISmartConnectionsPort } from '../ports/ISmartConnectionsPort';
import { DataviewApi, DataviewPage, HierarchyNode, RelatedNote, SemanticGraphHealerSettings } from '../../types';
import { StructuralCache } from '../StructuralCache';
import { HealerLogger, normalizeVaultPath } from '../HealerUtils';

export class UnifiedMetadataAdapter implements IMetadataAdapter {
    private datacore: DatacoreAdapter;
    private breadcrumbs: BreadcrumbsAdapter;
    private smartConnections: SmartConnectionsAdapter;
    private nativeVault: NativeVaultAdapter;

    private pageCache: StructuralCache<DataviewPage | null>;
    private hierarchyCache: StructuralCache<HierarchyNode | null>;
    private relatedNotesCache: StructuralCache<RelatedNote[]>;

    private inFlightMap = new Map<string, Promise<unknown>>();
    private _isDestroyed = false;
    private debouncedRefresh: () => void;
    private initialized: boolean = false;

    constructor(
        private app: App,
        private settings: SemanticGraphHealerSettings,
        dependencies: {
            datacore?: DatacoreAdapter;
            breadcrumbs?: BreadcrumbsAdapter;
            smartConnections?: SmartConnectionsAdapter;
            nativeVault?: NativeVaultAdapter;
        } = {},
        options: { maxNodes?: number; ttlMs?: number } = {},
    ) {
        const debug = this.settings.logLevel === 'debug';
        this.datacore =
            dependencies.datacore ??
            new DatacoreAdapter(this.app, debug, this.settings.pageChildrenCacheMaxSize ?? 500);
        this.breadcrumbs = dependencies.breadcrumbs ?? new BreadcrumbsAdapter(this.app, debug);
        this.smartConnections = dependencies.smartConnections ?? new SmartConnectionsAdapter(this.app, debug);
        this.nativeVault = dependencies.nativeVault ?? new NativeVaultAdapter(this.app, debug);

        this.pageCache = new StructuralCache<DataviewPage | null>(this.app, options);
        this.hierarchyCache = new StructuralCache<HierarchyNode | null>(this.app, options);
        this.relatedNotesCache = new StructuralCache<RelatedNote[]>(this.app, {
            ...options,
            ttlMs: 120000,
        });

        this.debouncedRefresh = debounce(() => {
            if (this._isDestroyed) return;
            this.invalidate();
            HealerLogger.debug('UnifiedMetadataAdapter: debounced refresh complete');
        }, 500);
    }

    public async initialize(): Promise<void> {
        if (this.initialized) return;

        // Check availability and notify if critical adapters are missing
        const adapters = [
            { name: 'Datacore', adapter: this.datacore },
            { name: 'Breadcrumbs', adapter: this.breadcrumbs },
        ];

        for (const { name, adapter } of adapters) {
            if (!adapter.isAvailable()) {
                new Notice(`Semantic Graph Healer: ${name} is not available. Some semantic links may be missing.`);
                HealerLogger.warn(`UnifiedMetadataAdapter: ${name} is not available.`);
            }
        }

        this.app.metadataCache.on('resolved', () => {
            HealerLogger.debug('UnifiedMetadataAdapter: metadataCache resolved, triggering debounced refresh');
            this.debouncedRefresh();
        });

        this.initialized = true;
    }

    public isAvailable(): boolean {
        return !this._isDestroyed;
    }

    public async getLinks(): Promise<SemanticLinkEdge[]> {
        const allEdges: SemanticLinkEdge[] = [];

        // Aggregate from all available adapters
        const adapters = [this.datacore, this.breadcrumbs, this.smartConnections, this.nativeVault];

        for (const adapter of adapters) {
            if (adapter.isAvailable()) {
                try {
                    const links = await adapter.getLinks();
                    allEdges.push(...links);
                } catch (e) {
                    HealerLogger.error(
                        `UnifiedMetadataAdapter: Failed to get links from ${adapter.constructor.name}`,
                        e,
                    );
                }
            }
        }

        return allEdges;
    }

    private safeExecute<T>(fn: () => T, fallback: T, context: string): T {
        try {
            return fn();
        } catch (e) {
            HealerLogger.error(`UnifiedMetadataAdapter: ${context} failed`, e);
            return fallback;
        }
    }

    private async safeExecuteAsync<T>(fn: () => Promise<T>, fallback: T, context: string): Promise<T> {
        try {
            return await fn();
        } catch (e) {
            HealerLogger.error(`UnifiedMetadataAdapter: ${context} failed`, e);
            return fallback;
        }
    }

    private async withCoalescing<T>(key: string, factory: () => Promise<T>): Promise<T> {
        const existing = this.inFlightMap.get(key);
        if (existing) return existing as Promise<T>;
        const p = (async () => {
            try {
                return await factory();
            } finally {
                this.inFlightMap.delete(key);
            }
        })();
        this.inFlightMap.set(key, p);
        return p;
    }

    private normalizeCacheKey(path: string, sourcePath = ''): string {
        return normalizeVaultPath(this.app, path, sourcePath);
    }

    getPage(path: string): DataviewPage | null {
        if (this._isDestroyed) {
            HealerLogger.debug(`getPage(${path}) called after destroy — skipped`);
            return null;
        }
        const key = this.normalizeCacheKey(path, path);
        const cached = this.pageCache.get(key);
        if (cached !== undefined) return cached;

        const page = this.safeExecute(() => this.datacore.getPage(key), null, `getPage(${key})`);

        if (page === null) return null;

        // Harden: support both Datacore $path and legacy path
        const pagePath =
            (page as { path?: string; $path?: string }).path || (page as { path?: string; $path?: string }).$path;
        if (pagePath && pagePath !== key) {
            HealerLogger.debug(`UnifiedMetadataAdapter: path mismatch for ${key} (got ${pagePath})`);
        }

        if (!this._isDestroyed) {
            this.pageCache.set(key, page);
        }
        return page;
    }

    public invalidateBacklinkIndex() {
        this.pageCache.invalidate();
        this.hierarchyCache.invalidate();
        this.relatedNotesCache.invalidate();
        this.datacore.invalidateBacklinkIndex();
    }

    async queryPages(query: string): Promise<DataviewPage[]> {
        return this.safeExecuteAsync(() => this.datacore.queryPages(query), [], `queryPages(${query})`);
    }

    getPages(query: string): DataviewPage[] {
        return this.safeExecute(() => this.datacore.getPages(query), [], `getPages(${query})`);
    }

    getBacklinks(path: string): string[] {
        return this.safeExecute(() => this.datacore.getBacklinks(path), [], `getBacklinks(${path})`);
    }

    getDataviewApi(): DataviewApi | null {
        return this.safeExecute(() => this.datacore.getDataviewApi(), null, 'getDataviewApi');
    }

    async getHierarchy(path: string): Promise<HierarchyNode | null> {
        if (this._isDestroyed) {
            HealerLogger.debug(`getHierarchy(${path}) called after destroy — skipped`);
            return null;
        }
        const key = this.normalizeCacheKey(path, path);
        const cached = this.hierarchyCache.get(key);
        if (cached !== undefined) return cached;

        const result = await this.withCoalescing(`hierarchy:${key}`, async () => {
            const hierarchy = await this.safeExecuteAsync(
                () => this.breadcrumbs.getHierarchy(key),
                null,
                `getHierarchy(${key})`,
            );
            // Write to cache only if adapter is still alive
            if (hierarchy !== null && !this._isDestroyed) {
                this.hierarchyCache.set(key, hierarchy);
            }
            return hierarchy;
        });

        return result;
    }

    async getRelatedNotes(path: string, limit: number): Promise<RelatedNote[]> {
        if (this._isDestroyed) {
            HealerLogger.debug(`getRelatedNotes(${path}) called after destroy — skipped`);
            return [];
        }
        const keyPath = this.normalizeCacheKey(path, path);
        const key = `${keyPath}|limit=${limit}`;
        const cached = this.relatedNotesCache.get(key);
        if (cached !== undefined) return cached;

        const result = await this.withCoalescing(`related:${key}`, async () => {
            const related = await this.safeExecuteAsync(
                () => this.smartConnections.getRelatedNotes(keyPath, limit),
                [],
                `getRelatedNotes(${keyPath})`,
            );
            // Write to cache only if adapter is still alive
            if (!this._isDestroyed) {
                this.relatedNotesCache.set(key, related);
            }
            return related;
        });

        return result;
    }

    invalidate(path?: string): void {
        const normalizedKey = path ? this.normalizeCacheKey(path, path) : undefined;
        this.pageCache.invalidate(normalizedKey);
        this.hierarchyCache.invalidate(normalizedKey);
        this.relatedNotesCache.invalidate();
        // Adapter caches: use normalized key to prevent stale cache due to path format mismatches
        const keyForAdapters = normalizedKey ?? path;
        this.datacore.invalidate(keyForAdapters);
        this.breadcrumbs.invalidate(keyForAdapters);
        this.smartConnections.invalidate(keyForAdapters);
    }

    public updateSettings(newSettings: SemanticGraphHealerSettings): void {
        this.settings = newSettings;
        this.invalidate();
    }

    public destroy(): void {
        this._isDestroyed = true;
        this.inFlightMap.clear();

        const destroyCache = (name: string, cache: { destroy?: () => void } | undefined): void => {
            try {
                cache?.destroy?.();
            } catch (e) {
                HealerLogger.error(`[UnifiedMetadataAdapter] cache.destroy failed (${name}):`, e as Error);
            }
        };

        destroyCache('pageCache', this.pageCache);
        destroyCache('hierarchyCache', this.hierarchyCache);
        destroyCache('relatedNotesCache', this.relatedNotesCache);

        for (const [name, adapter] of [
            ['datacore', this.datacore],
            ['breadcrumbs', this.breadcrumbs],
            ['smartConnections', this.smartConnections],
            ['nativeVault', this.nativeVault],
        ] as const) {
            try {
                adapter.destroy?.();
            } catch (e) {
                HealerLogger.error(`[UnifiedMetadataAdapter] ${name}.destroy() failed`, e);
            }
        }

        HealerLogger.debug('UnifiedMetadataAdapter destroyed.');
    }
}
