import { App, TFile, parseLinktext } from 'obsidian';
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

/**
 * UnifiedMetadataAdapter
 * Implements the Unified interface by delegating to specialized adapters
 * and wrapping them in a high-performance LRU cache.
 *
 * Propagates system settings and lifecycle signals
 * down to specialized adapters.
 */
export class UnifiedMetadataAdapter implements IMetadataAdapter {
    private datacore: IDataviewPort;
    private breadcrumbs: IBreadcrumbsPort;
    private smartConnections: ISmartConnectionsPort;

    // Phase 4: Performance Layer
    private pageCache: StructuralCache<DataviewPage | null>;
    private hierarchyCache: StructuralCache<HierarchyNode | null>;
    private relatedNotesCache: StructuralCache<RelatedNote[]>; // Phase 2 Hardening

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
        // Dependency injection with fallback to concrete adapters for backward compatibility / tests
        this.datacore =
            dependencies.datacore ??
            new DatacoreAdapter(
                this.app,
                this.settings.logLevel === 'debug',
                this.settings.pageChildrenCacheMaxSize ?? 500,
            );
        this.breadcrumbs = dependencies.breadcrumbs ?? new BreadcrumbsAdapter(this.app);
        this.smartConnections = dependencies.smartConnections ?? new SmartConnectionsAdapter(this.app);

        // Initialize Performance Caches
        this.pageCache = new StructuralCache<DataviewPage | null>(this.app, options);
        this.hierarchyCache = new StructuralCache<HierarchyNode | null>(this.app, options);

        // Related notes are short-lived to reflect embedding updates (2 min TTL)
        this.relatedNotesCache = new StructuralCache<RelatedNote[]>(this.app, {
            ...options,
            ttlMs: 120000,
        });
    }

    /**
     * Resiliency Wrapper: Protects the system from unhandled exceptions
     * in third-party plugin adapters.
     */
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

    private normalizeCacheKey(path: string, sourcePath = ''): string {
        return normalizeVaultPath(this.app, path, sourcePath);
    }

    getPage(path: string): DataviewPage | null {
        const key = this.normalizeCacheKey(path, path);
        const cached = this.pageCache.get(key);
        if (cached !== undefined) return cached;

        const page = this.safeExecute(() => this.datacore.getPage(key), null, `getPage(${key})`);

        // FIX: avoid caching null to prevent staleness when adapter becomes ready later
        if (page === null) return null;

        this.pageCache.set(key, page);
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
        const key = this.normalizeCacheKey(path, path);
        const cached = this.hierarchyCache.get(key);
        if (cached !== undefined) return cached;

        const hierarchy = await this.safeExecuteAsync(
            () => this.breadcrumbs.getHierarchy(key),
            null,
            `getHierarchy(${key})`,
        );

        // FIX: avoid caching null to prevent staleness when Breadcrumbs becomes ready
        if (hierarchy === null) return null;

        this.hierarchyCache.set(key, hierarchy);
        return hierarchy;
    }

    async getRelatedNotes(path: string, limit: number): Promise<RelatedNote[]> {
        // Normalize path once and use consistently for both cache-key and adapter call
        const keyPath = this.normalizeCacheKey(path, path);
        const key = `${keyPath}|limit=${limit}`;
        const cached = this.relatedNotesCache.get(key);
        if (cached !== undefined) return cached;

        // Pass normalized path to adapter to ensure consistency
        const related = await this.safeExecuteAsync(
            () => this.smartConnections.getRelatedNotes(keyPath, limit),
            [],
            `getRelatedNotes(${keyPath})`,
        );

        this.relatedNotesCache.set(key, related);
        return related;
    }

    invalidate(path?: string): void {
        const key = path ? this.normalizeCacheKey(path, path) : undefined;
        this.pageCache.invalidate(key);
        this.hierarchyCache.invalidate(key);

        // Related notes use composite keys, so we full-invalidate on specific path change
        // to ensure semantic updates are picked up.
        this.relatedNotesCache.invalidate();

        this.datacore.invalidate(path);
        this.breadcrumbs.invalidate(path);
        this.smartConnections.invalidate(path);
    }

    /**
     * Explicit cleanup for hot-reload and shutdown cycles.
     */
    public destroy(): void {
        // Isola distruzione cache — se una lancia, procedi comunque con le altre e coi sub-adapter
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
