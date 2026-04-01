import { App } from 'obsidian';
import { IMetadataAdapter } from './IMetadataAdapter';
import { DatacoreAdapter } from './DatacoreAdapter';
import { BreadcrumbsAdapter } from './BreadcrumbsAdapter';
import { SmartConnectionsAdapter } from './SmartConnectionsAdapter';
import { DataviewApi, DataviewPage, HierarchyNode, RelatedNote } from '../../types';
import { StructuralCache } from '../StructuralCache';
import { HealerLogger } from '../HealerUtils';

/**
 * UnifiedMetadataAdapter: The "Holy Grail" of 2026 Data Orchestration.
 * Implements the Unified interface by delegating to specialized adapters
 * and wrapping them in a high-performance LRU cache.
 */
export class UnifiedMetadataAdapter implements IMetadataAdapter {
    private datacore: DatacoreAdapter;
    private breadcrumbs: BreadcrumbsAdapter;
    private smartConnections: SmartConnectionsAdapter;

    // Phase 4: Performance Layer
    private pageCache: StructuralCache<DataviewPage | null>;
    private hierarchyCache: StructuralCache<HierarchyNode | null>;

    constructor(
        private app: App,
        options: { maxNodes?: number; ttlMs?: number } = {},
    ) {
        this.datacore = new DatacoreAdapter(this.app);
        this.breadcrumbs = new BreadcrumbsAdapter(this.app);
        this.smartConnections = new SmartConnectionsAdapter(this.app);

        // Initialize Performance Caches
        this.pageCache = new StructuralCache<DataviewPage | null>(this.app, options);
        this.hierarchyCache = new StructuralCache<HierarchyNode | null>(this.app, options);
    }

    getPage(path: string): DataviewPage | null {
        const cached = this.pageCache.get(path);
        if (cached !== undefined) return cached;

        const page = this.datacore.getPage(path);
        // Cache even null values to avoid repeated lookup loops
        // Invalidation must be handled by file creation/deletion events.
        this.pageCache.set(path, page);
        return page;
    }

    public invalidateBacklinkIndex() {
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
        const cached = this.hierarchyCache.get(path);
        if (cached !== undefined && cached !== null) return cached;

        let hierarchy = await this.breadcrumbs.getHierarchy(path);

        // Fallback: If BC fails, try Datacore (Basic hierarchies)
        if (!hierarchy) {
            hierarchy = await this.datacore.getHierarchy(path);
        }

        this.hierarchyCache.set(path, hierarchy);
        return hierarchy;
    }

    async getRelatedNotes(path: string, limit: number): Promise<RelatedNote[]> {
        // Semantic similarity results from SC change as the embedding model updates,
        // so we call it directly or with shorter TTL.
        return this.smartConnections.getRelatedNotes(path, limit);
    }

    invalidate(path?: string): void {
        this.pageCache.invalidate(path);
        this.hierarchyCache.invalidate(path);
        this.datacore.invalidate(path);
        this.breadcrumbs.invalidate(path);
        this.smartConnections.invalidate(path);
    }

    /**
     * ✅ NEW: Explicit cleanup for hot-reload and shutdown cycles.
     */
    public destroy(): void {
        this.pageCache.destroy();
        this.hierarchyCache.destroy();
        HealerLogger.debug('UnifiedMetadataAdapter destroyed.');
    }
}
