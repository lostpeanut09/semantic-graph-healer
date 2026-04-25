import type { HierarchyNode } from '../../types';

/**
 * Port abstraction for the Breadcrumbs integration layer.
 * Exposes only the methods used by downstream consumers (UnifiedMetadataAdapter).
 */
export interface IBreadcrumbsPort {
	/**
	 * Retrieves the navigation hierarchy (parents, children, siblings, next, prev)
	 * for the given note path.
	 */
	getHierarchy(path: string): Promise<HierarchyNode | null>;

	/**
	 * Invalidates cached data for the given path (or all if path omitted).
	 */
	invalidate(path?: string): void;

	/**
	 * Optional cleanup method called during plugin shutdown.
	 */
	destroy?(): void;
}
