import { App, TFile, parseLinktext } from 'obsidian';
import type { MultiGraph } from 'graphology';
import { IMetadataAdapter } from './IMetadataAdapter';
import { BreadcrumbsApi, DataviewApi, DataviewPage, HierarchyNode, RelatedNote, BCDirection } from '../../types';
import { HealerLogger, isObsidianInternalApp } from '../HealerUtils';

/**
 * BreadcrumbsAdapter: Decoupled Navigation Wrapper.
 * Compatible with local BCAPII surface used by Semantic Graph Healer.
 * Not guaranteed against the public upstream Breadcrumbs API.
 */

type BCAPIV4Like = {
    get_neighbours: (node?: string) => unknown; // EdgeList | undefined
};

export class BreadcrumbsAdapter implements IMetadataAdapter {
    constructor(private app: App) {}

    private getV4Api(): BCAPIV4Like | null {
        const w = window as { BCAPI?: { get_neighbours?: unknown } };
        if (w?.BCAPI && typeof w.BCAPI.get_neighbours === 'function') return w.BCAPI as BCAPIV4Like;

        // fallback: plugin.api (in V4 è proprio BCAPI)
        if (!isObsidianInternalApp(this.app)) return null;
        const plugin = (this.app as import('../../types').ExtendedApp).plugins.getPlugin('breadcrumbs');
        const api = (plugin as { api?: { get_neighbours?: unknown } })?.api;
        if (api && typeof api.get_neighbours === 'function') return api as BCAPIV4Like;

        return null;
    }

    private getApi(): BreadcrumbsApi | null {
        if (!isObsidianInternalApp(this.app)) return null;
        try {
            const plugin = (this.app as import('../../types').ExtendedApp).plugins.getPlugin('breadcrumbs');
            if (!plugin?.api) return null;
            const api = plugin.api;
            const graph = api.closedG ?? api.mainG;
            if (graph && graph.order === 0) {
                HealerLogger.debug?.('BreadcrumbsAdapter: graph order=0 (empty).');
            } else if (!graph) {
                HealerLogger.warn('BreadcrumbsAdapter: graphs are null.');
            }
            return api;
        } catch {
            return null;
        }
    }

    getPage(_path: string): DataviewPage | null {
        return null;
    }
    getPages(_query: string): DataviewPage[] {
        return [];
    }
    getBacklinks(_path: string): string[] {
        return [];
    }
    getDataviewApi(): DataviewApi | null {
        return null;
    }
    queryPages(_query: string): Promise<DataviewPage[]> {
        return Promise.resolve([]);
    }
    getRelatedNotes(_path: string, _limit: number): Promise<RelatedNote[]> {
        return Promise.resolve([]);
    }
    invalidateBacklinkIndex(): void {}
    invalidate(_path?: string): void {}

    async getHierarchy(path: string): Promise<HierarchyNode | null> {
        const normalizedPath = this.normalizeBreadcrumbPath(path);

        // 1) Breadcrumbs V4 path (BCAPI.get_neighbours → outgoing edges)
        const v4 = this.getV4Api();
        if (v4) {
            try {
                const edgeList = v4.get_neighbours(normalizedPath);
                const edges = this.bestEffortEdgeListToTargets(edgeList);

                const parents: string[] = [];
                const children: string[] = [];
                const siblings: string[] = [];
                const next: string[] = [];
                const prev: string[] = [];

                for (const edge of edges) {
                    const normalizedTarget = this.normalizeBreadcrumbPath(edge.target, normalizedPath);
                    if (!normalizedTarget || normalizedTarget === normalizedPath) continue;

                    if (edge.dir === 'up') parents.push(normalizedTarget);
                    else if (edge.dir === 'same') siblings.push(normalizedTarget);
                    else if (edge.dir === 'next') next.push(normalizedTarget);
                    else if (edge.dir === 'prev') prev.push(normalizedTarget);
                    else children.push(normalizedTarget); // Default to children ('down' or unknown)
                }

                return {
                    parents: [...new Set(parents)],
                    children: [...new Set(children)],
                    siblings: [...new Set(siblings)],
                    next: [...new Set(next)],
                    prev: [...new Set(prev)],
                };
            } catch (e) {
                HealerLogger.error(`BreadcrumbsAdapter(V4): get_neighbours failed for "${normalizedPath}"`, e);
                // continua su legacy
            }
        }

        const api = this.getApi();
        if (!api) return Promise.resolve(null);
        try {
            // Try getMatrixNeighbours first, but fall back to graph if it returns null
            if (typeof api.getMatrixNeighbours === 'function') {
                const fromMatrix = this.fromMatrixNeighbours(api, normalizedPath);
                if (fromMatrix) return Promise.resolve(fromMatrix);
                HealerLogger.debug?.(
                    `BreadcrumbsAdapter: getMatrixNeighbours returned null for "${normalizedPath}", falling back to graph.`,
                );
            }

            // Try closedG first; if it exists but returns null, fall back to mainG
            if (api.closedG?.hasNode?.(normalizedPath)) {
                const fromClosed = this.fromGraph(api.closedG, normalizedPath, false);
                if (fromClosed) return Promise.resolve(fromClosed);
            }

            // Fall back to mainG if closedG didn't work
            if (api.mainG?.hasNode?.(normalizedPath)) {
                const fromMain = this.fromGraph(api.mainG, normalizedPath, true);
                if (fromMain) return Promise.resolve(fromMain);
            }

            HealerLogger.warn(`BreadcrumbsAdapter: No usable hierarchy source for "${normalizedPath}".`);
        } catch (e) {
            HealerLogger.error(`BreadcrumbsAdapter: hierarchy extraction failed for "${normalizedPath}"`, e);
        }
        return Promise.resolve(null);
    }

    private normalizeBreadcrumbPath(path: string, sourcePath = ''): string {
        // Extract linkpath, discard subpath (heading/block)
        const { path: linkpath } = parseLinktext(path);

        const file = this.app.vault.getAbstractFileByPath(linkpath);
        if (file instanceof TFile) return file.path;

        const resolved = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
        return resolved?.path ?? linkpath;
    }

    private isDirection(x: unknown): x is BCDirection {
        return x === 'up' || x === 'down' || x === 'same' || x === 'next' || x === 'prev';
    }

    private bestEffortEdgeListToTargets(edgeList: unknown): { target: string; dir?: string }[] {
        const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

        const edges: unknown[] = Array.isArray(edgeList)
            ? edgeList
            : isObj(edgeList) && Array.isArray(edgeList.edges)
              ? edgeList.edges
              : [];

        const out: { target: string; dir?: string }[] = [];
        for (const e of edges) {
            let target: string | null = null;
            let dir: string | undefined = undefined;

            if (typeof e === 'string') {
                target = e;
            } else if (isObj(e)) {
                if (typeof e.target === 'string') target = e.target;
                else if (typeof e.to === 'string') target = e.to;

                // Try to extract dir
                if (typeof e.dir === 'string') dir = e.dir;
                else if (isObj(e.attr) && typeof e.attr.dir === 'string') dir = e.attr.dir;
                else if (isObj(e.attrs) && typeof e.attrs.dir === 'string') dir = e.attrs.dir;
            }

            if (target) out.push({ target, dir });
        }
        return out;
    }

    private fromMatrixNeighbours(api: BreadcrumbsApi, path: string): HierarchyNode | null {
        const dirs = api.DIRECTIONS ?? (['up', 'same', 'down', 'next', 'prev'] as const);
        const raw = api.getMatrixNeighbours(path, dirs);
        if (!raw) return null;
        return {
            parents: this.flattenNeighbours(raw.up, path),
            children: this.flattenNeighbours(raw.down, path),
            siblings: this.flattenNeighbours(raw.same, path),
            next: this.flattenNeighbours(raw.next, path),
            prev: this.flattenNeighbours(raw.prev, path),
        };
    }

    private flattenNeighbours(value: unknown, currentPath?: string): string[] {
        if (!value) return [];
        const result: string[] = [];
        const seen = new WeakSet<object>();
        const visit = (item: unknown) => {
            if (!item) return;
            if (typeof item === 'string') {
                const normalized = this.normalizeBreadcrumbPath(item);
                if (!currentPath || normalized !== currentPath) result.push(normalized);
                return;
            }
            if (Array.isArray(item)) {
                for (const sub of item) visit(sub);
                return;
            }
            if (typeof item === 'object') {
                if (seen.has(item)) return;
                seen.add(item);
                const obj = item as Record<string, unknown>;
                if (typeof obj.path === 'string') return visit(obj.path);
                if (typeof obj.normalizedPath === 'string') return visit(obj.normalizedPath);
                if (typeof obj.node === 'string') return visit(obj.node);
                if (Array.isArray(obj.paths)) return visit(obj.paths);
                if (Array.isArray(obj.normalizedPaths)) return visit(obj.normalizedPaths);
            }
        };
        visit(value);
        return [...new Set(result)];
    }

    private fromGraph(graph: MultiGraph, path: string, reverseIn: boolean): HierarchyNode | null {
        if (!graph.hasNode(path)) {
            HealerLogger.debug(`BreadcrumbsAdapter: "${path}" not found in graph (${graph.order} nodes).`);
            return null;
        }
        const parents: string[] = [],
            children: string[] = [],
            siblings: string[] = [],
            next: string[] = [],
            prev: string[] = [];
        graph.forEachOutEdge(path, (_edge, attrs, _src, target, _srcAttrs, _tgtAttrs) => {
            const dir = (attrs as Record<string, unknown>)?.dir;
            if (!this.isDirection(dir)) return;
            const normalizedTarget = this.normalizeBreadcrumbPath(target, path);
            if (!normalizedTarget || normalizedTarget === path) return;
            switch (dir) {
                case 'up':
                    parents.push(normalizedTarget);
                    break;
                case 'down':
                    children.push(normalizedTarget);
                    break;
                case 'same':
                    siblings.push(normalizedTarget);
                    break;
                case 'next':
                    next.push(normalizedTarget);
                    break;
                case 'prev':
                    prev.push(normalizedTarget);
                    break;
            }
        });
        if (reverseIn && typeof graph.forEachInEdge === 'function') {
            graph.forEachInEdge(path, (_edge, attrs, source, _target, _srcAttrs, _tgtAttrs) => {
                const dir = (attrs as Record<string, unknown>)?.dir;
                if (!this.isDirection(dir)) return;
                const normalizedSource = this.normalizeBreadcrumbPath(source, path);
                if (!normalizedSource || normalizedSource === path) return;
                switch (dir) {
                    case 'down':
                        parents.push(normalizedSource);
                        break;
                    case 'up':
                        children.push(normalizedSource);
                        break;
                    case 'next':
                        prev.push(normalizedSource);
                        break;
                    case 'prev':
                        next.push(normalizedSource);
                        break;
                    case 'same':
                        siblings.push(normalizedSource);
                        break;
                }
            });
        }
        return {
            parents: [...new Set(parents)],
            children: [...new Set(children)],
            siblings: [...new Set(siblings)],
            next: [...new Set(next)],
            prev: [...new Set(prev)],
        };
    }
}
