import { App, TFile, parseLinktext } from 'obsidian';
import { IMetadataAdapter } from './IMetadataAdapter';
import { DatacoreAdapter } from './DatacoreAdapter';
import { BreadcrumbsAdapter } from './BreadcrumbsAdapter';
import { SmartConnectionsAdapter } from './SmartConnectionsAdapter';
import { DataviewApi, DataviewPage, HierarchyNode, RelatedNote, SemanticGraphHealerSettings } from '../../types';
import { StructuralCache } from '../StructuralCache';
import { HealerLogger } from '../HealerUtils';

/**
 * UnifiedMetadataAdapter
 * Implements the Unified interface by delegating to specialized adapters
 * and wrapping them in a high-performance LRU cache.
 *
 * Propagates system settings and lifecycle signals
 * down to specialized adapters.
 */
export class UnifiedMetadataAdapter implements IMetadataAdapter {
    private datacore: IMetadataAdapter;
    private breadcrumbs: IMetadataAdapter;
    private smartConnections: IMetadataAdapter;

    // Phase 4: Performance Layer
    private pageCache: StructuralCache<DataviewPage | null>;
    private hierarchyCache: StructuralCache<HierarchyNode | null>;

    constructor(
        private app: App,
        private settings: SemanticGraphHealerSettings,
        options: { maxNodes?: number; ttlMs?: number } = {},
    ) {
        this.datacore = new DatacoreAdapter(this.app, this.settings.logLevel === 'debug');
        this.breadcrumbs = new BreadcrumbsAdapter(this.app);
        this.smartConnections = new SmartConnectionsAdapter(this.app);

        // Initialize Performance Caches
        this.pageCache = new StructuralCache<DataviewPage | null>(this.app, options);
        this.hierarchyCache = new StructuralCache<HierarchyNode | null>(this.app, options);
    }

    private normalizeCacheKey(path: string, sourcePath = ''): string {
        const { path: linkpath } = parseLinktext(path);
        const direct = this.app.vault.getAbstractFileByPath(linkpath);
        if (direct instanceof TFile) return direct.path;
        return this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath)?.path ?? linkpath;
    }

    getPage(path: string): DataviewPage | null {
        const key = this.normalizeCacheKey(path, path);
        const cached = this.pageCache.get(key);
        if (cached !== undefined) return cached;

        const page = this.datacore.getPage(key);
        // Cache even null values to avoid repeated lookup loops.
        this.pageCache.set(key, page);
        return page;
    }

    public invalidateBacklinkIndex() {
        this.pageCache.invalidate();
        this.datacore.invalidateBacklinkIndex();
    }

    async queryPages(query: string): Promise<DataviewPage[]> {
        // Query results depend on the full vault, so we don't cache
        // them as aggressively as individual page properties.
        return this.datacore.queryPages(query);
    }

    getPages(query: string): DataviewPage[] {
        return this.datacore.getPages(query);
    }

    getBacklinks(path: string): string[] {
        return this.datacore.getBacklinks(path);
    }

    getDataviewApi(): DataviewApi | null {
        return this.datacore.getDataviewApi();
    }

    async getHierarchy(path: string): Promise<HierarchyNode | null> {
        const key = this.normalizeCacheKey(path, path);
        const cached = this.hierarchyCache.get(key);
        if (cached !== undefined) return cached;

        const hierarchy = await this.breadcrumbs.getHierarchy(key);

        this.hierarchyCache.set(key, hierarchy);
        return hierarchy;
    }

    async getRelatedNotes(path: string, limit: number): Promise<RelatedNote[]> {
        // Semantic similarity results from SC change as the embedding model updates,
        // so we call it directly or with shorter TTL.
        return this.smartConnections.getRelatedNotes(path, limit);
    }

    invalidate(path?: string): void {
        const key = path ? this.normalizeCacheKey(path, path) : undefined;
        this.pageCache.invalidate(key);
        this.hierarchyCache.invalidate(key);
        this.datacore.invalidate(path);
        this.breadcrumbs.invalidate(path);
        this.smartConnections.invalidate(path);
    }

    /**
     * Explicit cleanup for hot-reload and shutdown cycles.
     */
    public destroy(): void {
        this.pageCache.destroy();
        this.hierarchyCache.destroy();
        this.datacore.destroy?.();
        this.breadcrumbs.destroy?.();
        this.smartConnections.destroy?.();
        HealerLogger.debug('UnifiedMetadataAdapter destroyed.');
    }
}
