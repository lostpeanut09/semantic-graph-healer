import { App } from 'obsidian';
import type { MultiGraph } from 'graphology';                      // FIX: static type import
import { IMetadataAdapter } from './IMetadataAdapter';
import {
    BreadcrumbsApi,
    DataviewApi,
    DataviewPage,
    HierarchyNode,
    RelatedNote,
    BCDirection,
} from '../../types';
import { HealerLogger, isObsidianInternalApp } from '../HealerUtils';

/**
 * BreadcrumbsAdapter: Decoupled Navigation Wrapper.
 * Compatible with Breadcrumbs V4.4+ (BCAPII).
 *
 * Canonical BCAPII surface (interfaces.ts):
 *   - DIRECTIONS: readonly ["up", "same", "down", "next", "prev"]
 *   - mainG:   MultiGraph  — explicit edges only
 *   - closedG: MultiGraph  — explicit + implied edges
 *   - getMatrixNeighbours(node, dirs): neighbour map
 *   - getSubInDirs(dirs, graph?): filtered subgraph
 *   - refreshIndex(): rebuild graph
 */
export class BreadcrumbsAdapter implements IMetadataAdapter {
    constructor(private app: App) {}

    // ── API Access ───────────────────────────────────────────────

    private getApi(): BreadcrumbsApi | null {
        if (!isObsidianInternalApp(this.app)) return null;

        try {
            const plugin = (this.app as import('../../types').ExtendedApp)
                .plugins.getPlugin('breadcrumbs');

            if (!plugin?.api) return null;

            const api = plugin.api;

            // FIX: Soft warning for graph.order === 0.
            // Don't block the API; legit empty vaults exist.
            const graph = api.closedG ?? api.mainG;
            if (graph && graph.order === 0) {
                HealerLogger.debug?.(
                    'BreadcrumbsAdapter: graph order=0 (empty). Proceeding with API.',
                );
            } else if (!graph) {
                HealerLogger.warn('BreadcrumbsAdapter: graphs are null.');
            }

            return api;
        } catch {
            return null;
        }
    }

    // ── IMetadataAdapter stubs ───────────────────────────────────

    getPage(_path: string): DataviewPage | null { return null; }
    getPages(_query: string): DataviewPage[] { return []; }
    getBacklinks(_path: string): string[] { return []; }
    getDataviewApi(): DataviewApi | null { return null; }
    queryPages(_query: string): Promise<DataviewPage[]> { return Promise.resolve([]); }
    getRelatedNotes(_path: string, _limit: number): Promise<RelatedNote[]> { return Promise.resolve([]); }
    invalidateBacklinkIndex(): void {}
    invalidate(_path?: string): void {}

    // ── Core: Hierarchy Extraction ───────────────────────────────

    /**
     * Extract hierarchy for a note from the Breadcrumbs graph.
     * satisfying require-await by returning Promise.resolve from non-async method.
     *
     * Strategy:
     *   1. getMatrixNeighbours() — High-level API
     *   2. closedG traversal    — implied edges already present
     *   3. mainG traversal      — explicit edges only (+ reverse)
     */
    getHierarchy(path: string): Promise<HierarchyNode | null> {
        const api = this.getApi();
        if (!api) return Promise.resolve(null);

        try {
            if (typeof api.getMatrixNeighbours === 'function') {
                return Promise.resolve(this.fromMatrixNeighbours(api, path));
            }

            if (api.closedG && typeof api.closedG.hasNode === 'function') {
                return Promise.resolve(this.fromGraph(api.closedG, path, false));
            }

            if (api.mainG && typeof api.mainG.hasNode === 'function') {
                return Promise.resolve(this.fromGraph(api.mainG, path, true));
            }

            HealerLogger.warn(`BreadcrumbsAdapter: No usable API method for "${path}".`);
        } catch (e) {
            HealerLogger.error(`BreadcrumbsAdapter: hierarchy extraction failed for "${path}"`, e);
        }

        return Promise.resolve(null);
    }

    // ── Private Helpers ──────────────────────────────────────────

    private isDirection(x: unknown): x is BCDirection {
        return x === 'up' || x === 'down' || x === 'same' || x === 'next' || x === 'prev';
    }

    private fromMatrixNeighbours(
        api: BreadcrumbsApi,
        path: string,
    ): HierarchyNode | null {
        const dirs = api.DIRECTIONS ?? (['up', 'same', 'down', 'next', 'prev'] as const);
        const raw = api.getMatrixNeighbours(path, dirs);
        if (!raw) return null;

        return {
            parents:  this.flattenNeighbours(raw.up),
            children: this.flattenNeighbours(raw.down),
            siblings: this.flattenNeighbours(raw.same),
            next:     this.flattenNeighbours(raw.next),
            prev:     this.flattenNeighbours(raw.prev),
        };
    }

    /**
     * Flatten neighbor shapes (string[], nested lists, or single objects).
     */
    private flattenNeighbours(value: unknown): string[] {
        if (!value) return [];

        const result: string[] = [];

        const handleItem = (item: unknown) => {
            if (typeof item === 'string') {
                result.push(item);
                return;
            }

            // Handles { field: string, paths: string[][] }
            if (item && typeof item === 'object' && 'paths' in item) {
                const paths = (item as { paths: unknown }).paths;
                if (Array.isArray(paths)) {
                    for (const group of paths) {
                        if (Array.isArray(group)) {
                            result.push(...group.filter((p) => typeof p === 'string'));
                        }
                    }
                }
            }
        };

        if (Array.isArray(value)) {
            for (const item of value) handleItem(item);
        } else {
            handleItem(value); // Fallback: try as single item
        }

        return [...new Set(result)];
    }

    private fromGraph(
        graph: MultiGraph,
        path: string,
        reverseIn: boolean,
    ): HierarchyNode | null {
        // Safe check for node existence to prevent NodeNotFoundError
        if (!graph.hasNode(path)) {
            HealerLogger.debug(
                `BreadcrumbsAdapter: "${path}" not found in graph (${graph.order} nodes).`,
            );
            return null;
        }

        const parents:  string[] = [];
        const children: string[] = [];
        const siblings: string[] = [];
        const next:     string[] = [];
        const prev:     string[] = [];

        // Out-edges: 6-param callback signature
        graph.forEachOutEdge(
            path,
            (
                _edge: string,
                attrs: Record<string, unknown>,
                _src: string,
                target: string,
                _srcAttrs: Record<string, unknown>,
                _tgtAttrs: Record<string, unknown>,
            ) => {
                const dir = attrs?.dir;
                if (!this.isDirection(dir)) return;

                switch (dir) {
                    case 'up':   parents.push(target);  break;
                    case 'down': children.push(target); break;
                    case 'same': siblings.push(target); break;
                    case 'next': next.push(target);     break;
                    case 'prev': prev.push(target);     break;
                }
            },
        );

        // In-edges: reversal only for mainG
        if (reverseIn && typeof graph.forEachInEdge === 'function') {
            graph.forEachInEdge(
                path,
                (
                    _edge: string,
                    attrs: Record<string, unknown>,
                    source: string,
                    _target: string,
                    _srcAttrs: Record<string, unknown>,
                    _tgtAttrs: Record<string, unknown>,
                ) => {
                    const dir = attrs?.dir;
                    if (!this.isDirection(dir)) return;

                    switch (dir) {
                        case 'down': parents.push(source);  break;
                        case 'up':   children.push(source); break;
                        case 'next': prev.push(source);     break;
                        case 'prev': next.push(source);     break;
                        case 'same': siblings.push(source); break;
                    }
                },
            );
        }

        return {
            parents:  [...new Set(parents)],
            children: [...new Set(children)],
            siblings: [...new Set(siblings)],
            next:     [...new Set(next)],
            prev:     [...new Set(prev)],
        };
    }
}
