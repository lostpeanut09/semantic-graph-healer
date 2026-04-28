import { App } from 'obsidian';
import type { IMetadataAdapter } from './IMetadataAdapter';
import { DatacoreAdapter } from './DatacoreAdapter';
import { BreadcrumbsAdapter } from './BreadcrumbsAdapter';
import { SmartConnectionsAdapter } from './SmartConnectionsAdapter';
import type { IDataviewPort } from '../ports/IDataviewPort';
import type { IBreadcrumbsPort } from '../ports/IBreadcrumbsPort';
import type { ISmartConnectionsPort } from '../ports/ISmartConnectionsPort';
import { DataviewApi, DataviewPage, HierarchyNode, RelatedNote, SemanticGraphHealerSettings } from '../../types';
import { StructuralCache } from '../StructuralCache';
import { HealerLogger, normalizeVaultPath } from '../HealerUtils';

export class UnifiedMetadataAdapter implements IMetadataAdapter {
    private datacore: IDataviewPort;
    private breadcrumbs: IBreadcrumbsPort;
    private smartConnections: ISmartConnectionsPort;

    private pageCache: StructuralCache<DataviewPage | null>;
    private hierarchyCache: StructuralCache<HierarchyNode | null>;
    private relatedNotesCache: StructuralCache<RelatedNote[]>;

    private inFlightMap = new Map<string, Promise<unknown>>();
    private _isDestroyed = false;

    constructor(
        private app: App,
        private settings: SemanticGraphHealerSettings,
        dependencies: {
            datacore?: IDataviewPort;
            breadcrumbs?: IBreadcrumbsPort;
            smartConnections?: ISmartConnectionsPort;
        } = {},
        options: { maxNodes?: number; ttlMs?: number } = {},
    ) {
        this.datacore =
            dependencies.datacore ??
            new DatacoreAdapter(
                this.app,
                this.settings.logLevel === 'debug',
                this.settings.pageChildrenCacheMaxSize ?? 500,
            );
        this.breadcrumbs = dependencies.breadcrumbs ?? new BreadcrumbsAdapter(this.app);
        this.smartConnections = dependencies.smartConnections ?? new SmartConnectionsAdapter(this.app);

        this.pageCache = new StructuralCache<DataviewPage | null>(this.app, options);
        this.hierarchyCache = new StructuralCache<HierarchyNode | null>(this.app, options);
        this.relatedNotesCache = new StructuralCache<RelatedNote[]>(this.app, {
            ...options,
            ttlMs: 120000,
        });
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
