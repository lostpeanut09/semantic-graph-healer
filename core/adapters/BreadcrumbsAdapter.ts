import { App } from 'obsidian';
import { IMetadataAdapter } from './IMetadataAdapter';
import { BreadcrumbsApi, DataviewApi, DataviewPage, HierarchyNode, RelatedNote } from '../../types';
import { HealerLogger, isObsidianInternalApp } from '../HealerUtils';

/**
 * BreadcrumbsAdapter: Decoupled Navigation Wrapper.
 * SOTA 2026 Strategy: Support V3 and V4 hierarchies without core dependency.
 */
export class BreadcrumbsAdapter implements IMetadataAdapter {
    constructor(private app: App) {}

    private getApi(): BreadcrumbsApi | null {
        if (!isObsidianInternalApp(this.app)) return null;
        const plugin = (this.app as import('../../types').ExtendedApp).plugins.getPlugin('breadcrumbs');
        return plugin && plugin.api ? plugin.api : null;
    }

    getPage(path: string): DataviewPage | null {
        return null; // Breadcrumbs is not a page-provider
    }

    public invalidateBacklinkIndex() {}

    public getPages(query: string): DataviewPage[] {
        return [];
    }

    public getBacklinks(path: string): string[] {
        return [];
    }

    public getDataviewApi(): DataviewApi | null {
        return null;
    }

    queryPages(_query: string): Promise<DataviewPage[]> {
        return Promise.resolve([]); // Breadcrumbs doesn't support Dataview-style queries
    }

    async getHierarchy(path: string): Promise<HierarchyNode | null> {
        await Promise.resolve();
        const api = this.getApi();
        if (!api) return null;

        try {
            // V4 Pattern: Get edges directly
            if (api.get_edges) {
                const edges = api.get_edges({ source: path });
                const parents: string[] = [];
                const children: string[] = [];
                const next: string[] = [];
                const prev: string[] = [];

                for (const edge of edges || []) {
                    if (edge.field === 'up' || edge.field === 'parent') parents.push(edge.target);
                    if (edge.field === 'down' || edge.field === 'child') children.push(edge.target);
                    if (edge.field === 'next') next.push(edge.target);
                    if (edge.field === 'prev') prev.push(edge.target);
                }

                return { parents, children, next, prev };
            }

            // V3 Pattern: Hierarchies
            if (api.get_hierarchy) {
                const hierarchy = api.get_hierarchy(path);
                return {
                    parents: hierarchy?.up || hierarchy?.parent || [],
                    children: hierarchy?.down || hierarchy?.child || [],
                    next: hierarchy?.next || [],
                    prev: hierarchy?.prev || [],
                };
            }
        } catch (e) {
            HealerLogger.error(`BreadcrumbsAdapter: API call failed for ${path}`, e);
        }

        return null;
    }

    getRelatedNotes(_path: string, _limit: number): Promise<RelatedNote[]> {
        return Promise.resolve([]); // Breadcrumbs is hierarchical, not similarity-based
    }

    invalidate(path?: string): void {
        // Breadcrumbs has its own refresh logic
    }
}
