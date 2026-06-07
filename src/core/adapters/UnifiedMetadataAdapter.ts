import { App, debounce, Notice } from 'obsidian';
import type { EventRef } from 'obsidian';
import type { IMetadataAdapter } from './IMetadataAdapter';
import { DatacoreAdapter } from './DatacoreAdapter';
import { BreadcrumbsAdapter } from './BreadcrumbsAdapter';
import { SmartConnectionsAdapter } from './SmartConnectionsAdapter';
import { NativeVaultAdapter } from './NativeVaultAdapter';
import type { SemanticLinkEdge } from './types';
import type { DataviewApi, DataviewPage, HierarchyNode, RelatedNote, SemanticGraphHealerSettings } from '../../types';
import { StructuralCache } from '../StructuralCache';
import { HealerLogger } from '../utils/HealerLogger';
import { normalizeVaultPath } from '../HealerUtils';

export class UnifiedMetadataAdapter implements IMetadataAdapter {
    private datacore: DatacoreAdapter;
    private breadcrumbs: BreadcrumbsAdapter;
    private smartConnections: SmartConnectionsAdapter;
    private nativeVault: NativeVaultAdapter;
    public readonly id = 'unified';

    private pageCache: StructuralCache<DataviewPage | null>;
    private hierarchyCache: StructuralCache<HierarchyNode | null>;
    private relatedNotesCache: StructuralCache<RelatedNote[]>;

    private inFlightMap = new Map<string, Promise<unknown>>();
    private _isDestroyed = false;
    public get isDestroyed(): boolean {
        return this._isDestroyed;
    }
    private debouncedRefresh: () => void;
    private initialized: boolean = false;
    private eventRefs: EventRef[] = [];

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

    public initialize(): Promise<void> {
        if (this.initialized) return Promise.resolve();

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

        const ref = this.app.metadataCache.on('resolved', () => {
            HealerLogger.debug('UnifiedMetadataAdapter: metadataCache resolved, triggering debounced refresh');
            this.debouncedRefresh();
        });
        this.eventRefs.push(ref);

        this.initialized = true;
        return Promise.resolve();
    }

    public isAvailable(): boolean {
        return !this._isDestroyed;
    }

    public async getLinks(): Promise<SemanticLinkEdge[]> {
        // Aggregate from all available adapters in parallel
        const adapters = [this.datacore, this.breadcrumbs, this.smartConnections, this.nativeVault];
        const results = await Promise.all(adapters.map((a) => a.getLinksSafe()));
        const flatLinks = results.flat();

        // Deduplicate using source|target|type key
        const linkMap = new Map<string, SemanticLinkEdge>();

        for (const link of flatLinks) {
            const key = `${link.sourcePath}|${link.targetPath}|${link.type}`;
            const existing = linkMap.get(key);

            if (!existing) {
                linkMap.set(key, { ...link });
                continue;
            }

            // Confidence priority
            const linkConfidence = link.confidence ?? 0;
            const existingConfidence = existing.confidence ?? 0;

            if (linkConfidence > existingConfidence) {
                linkMap.set(key, { ...link });
            } else if (linkConfidence === existingConfidence) {
                // Merge context on tie, keep first position
                if (link.context && existing.context) {
                    if (!existing.context.includes(link.context)) {
                        existing.context = `${existing.context}\n${link.context}`;
                    }
                } else if (link.context) {
                    existing.context = link.context;
                }
            }
        }

        return Array.from(linkMap.values());
    }

    public async getLinksSafe(): Promise<SemanticLinkEdge[]> {
        if (this._isDestroyed) return [];
        try {
            return await this.getLinks();
        } catch (e) {
            HealerLogger.error('UnifiedMetadataAdapter: getLinksSafe failed', e);
            return [];
        }
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

        // Cleanup tracked EventRefs
        for (const ref of this.eventRefs) {
            this.app.metadataCache.offref(ref);
        }
        this.eventRefs = [];

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
