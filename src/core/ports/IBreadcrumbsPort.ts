import type { HierarchyNode } from '../../types';

/**
 * IBreadcrumbsPort
 *
 * Port abstraction for the Breadcrumbs integration layer.
 * Defines the contract for interacting with external hierarchy data providers.
 */
export interface IBreadcrumbsPort {
    /**
     * Retrieves the navigation hierarchy (parents, children, siblings, next, prev)
     * for the given note path.
     *
     * @param path - The absolute path of the note within the vault.
     * @returns A promise resolving to the HierarchyNode or null if not available.
     */
    getHierarchy(path: string): Promise<HierarchyNode | null>;

    /**
     * Invalidates cached data for the given path.
     *
     * @param path - Optional. The file path to invalidate. If omitted, clears all entries.
     */
    invalidate(path?: string): void;

    /**
     * Optional cleanup method called during plugin shutdown.
     * Unregisters any active listeners or clears memory.
     */
    destroy?(): void;
}
