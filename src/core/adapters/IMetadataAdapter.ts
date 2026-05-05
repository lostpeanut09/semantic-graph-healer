import type { DataviewApi, DataviewPage, RelatedNote, HierarchyNode } from '../../types';
import { SemanticLinkEdge } from './types';

/**
 * IMetadataAdapter: Unified Interface for External Plugin Data.
 * SOTA 2026 Strategy: Decoupling the Healer core from specific plugin API changes.
 *
 * This interface ensures all adapters provide normalized data formats regardless
 * of their underlying source (Dataview, Datacore, Breadcrumbs, etc.).
 */
export interface IMetadataAdapter {
    /**
     * Unique, stable identifier for the adapter (e.g., "dataview", "datacore").
     */
    readonly id: string;

    /**
     * Checks if the underlying source/plugin is ready for operations.
     */
    isAvailable(): boolean;

    /**
     * True if the adapter has been shut down via destroy().
     */
    readonly isDestroyed: boolean;

    /**
     * Initializes the adapter (e.g., registering event listeners, pre-fetching data).
     * Must be idempotent and safe to call multiple times.
     */
    initialize(): Promise<void>;

    /**
     * Retrieves all semantic links extracted by this adapter.
     */
    getLinks(): Promise<SemanticLinkEdge[]>;

    /**
     * Safe wrapper for link extraction with built-in error handling and destruction guards.
     */
    getLinksSafe(): Promise<SemanticLinkEdge[]>;

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
    destroy(): void;
}
