import type { DataviewApi, DataviewPage, RelatedNote, HierarchyNode } from '../../types';
import { SemanticLinkEdge } from './types';

/**
 * IMetadataAdapter: Unified Interface for External Plugin Data.
 * SOTA 2026 Strategy: Decoupling the Core Healer from external API changes.
 */
export interface IMetadataAdapter {
    /**
     * Checks if the underlying source is ready.
     */
    isAvailable(): boolean;

    /**
     * Retrieves all semantic links extracted by this adapter.
     */
    getLinks(): Promise<SemanticLinkEdge[]>;

    /**
     * Retrieves a single page's metadata in a normalized format.
     */
    getPage(path: string): DataviewPage | null;

    /**
     * Legacy/Synchronous backlink index invalidation.
     */
    invalidateBacklinkIndex(): void;

    /**
     * Executes a complex query across the vault.
     */
    queryPages(query: string): Promise<DataviewPage[]>;

    /**
     * Legacy/Direct support for Dataview-style queries (sync).
     */
    getPages(query: string): DataviewPage[];

    /**
     * Retrieves backlinks for a specific path.
     */
    getBacklinks(path: string): string[];

    /**
     * Retrieves the raw Dataview API instance (legacy support).
     */
    getDataviewApi(): DataviewApi | null;

    /**
     * Retrieves hierarchical Breadcrumbs (V3/V4) data.
     */
    getHierarchy(path: string): Promise<HierarchyNode | null>;

    /**
     * Retrieves related notes from Smart Connections or Similar.
     */
    getRelatedNotes(path: string, limit: number): Promise<RelatedNote[]>;

    /**
     * Invalidates cache for a specific path or the entire adapter.
     */
    invalidate(path?: string): void;

    /**
     * Explicit cleanup for hot-reload and shutdown cycles.
     */
    destroy?(): void;
}
