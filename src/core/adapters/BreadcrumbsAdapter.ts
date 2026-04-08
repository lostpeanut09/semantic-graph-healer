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
    fields?: unknown;
    field_groups?: unknown;
};

export class BreadcrumbsAdapter implements IMetadataAdapter {
    constructor(private app: App) {}

    private getV4Api(): BCAPIV4Like | null {
        // 1) prefer window.BCAPI (Breadcrumbs V4 explicitly exposes it)
        const w = window as unknown;
        if (w?.BCAPI && typeof w.BCAPI.get_neighbours === 'function') return w.BCAPI as BCAPIV4Like;

        // 2) fallback: plugin.api
        if (!isObsidianInternalApp(this.app)) return null;
        try {
            const plugin = (this.app as import('../../types').ExtendedApp).plugins.getPlugin('breadcrumbs');
            const api = plugin?.api as unknown;
            if (api && typeof api.get_neighbours === 'function') return api as BCAPIV4Like;
        } catch {
            // ignore
        }

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

    getHierarchy(path: string): Promise<HierarchyNode | null> {
        const normalizedPath = this.normalizeBreadcrumbPath(path);

        // NEW: Breadcrumbs V4 path (BCAPI)
        const v4 = this.getV4Api();
        if (v4) {
            try {
                const edgeList = v4.get_neighbours(normalizedPath);
                const fromV4 = this.toHierarchyFromV4Neighbours(edgeList, normalizedPath);
                if (fromV4) return Promise.resolve(fromV4);
            } catch (e) {
                HealerLogger.error(`BreadcrumbsAdapter(V4): get_neighbours failed for "${normalizedPath}"`, e);
                // continue with legacy fallback
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

    private toHierarchyFromV4Neighbours(edgeList: unknown, currentPath: string): HierarchyNode | null {
        // EdgeList shape not publicly documented for external integrations -> best-effort parsing
        const edges = Array.isArray(edgeList)
            ? edgeList
            : edgeList && typeof edgeList === 'object' && Array.isArray((edgeList as unknown).edges)
              ? (edgeList as unknown).edges
              : [];

        const children: string[] = [];

        for (const e of edges) {
            // try common patterns: string, {to}, {target}, {path}
            const rawTarget =
                typeof e === 'string'
                    ? e
                    : e && typeof e === 'object' && typeof e.to === 'string'
                      ? e.to
                      : e && typeof e === 'object' && typeof e.target === 'string'
                        ? e.target
                        : e && typeof e === 'object' && typeof e.path === 'string'
                          ? e.path
                          : null;

            if (!rawTarget) continue;

            const target = this.normalizeBreadcrumbPath(rawTarget, currentPath);
            if (target && target !== currentPath) children.push(target);
        }

        // We initially return 'children' because get_neighbours typically returns outgoing edges.
        // Expanding to other directions safely would require richer EdgeList type knowledge.
        return {
            parents: [],
            children: [...new Set(children)],
            siblings: [],
            next: [],
            prev: [],
        };
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
            const dir = attrs?.dir;
            if (!this.isDirection(dir)) return;
            switch (dir) {
                case 'up':
                    parents.push(target);
                    break;
                case 'down':
                    children.push(target);
                    break;
                case 'same':
                    siblings.push(target);
                    break;
                case 'next':
                    next.push(target);
                    break;
                case 'prev':
                    prev.push(target);
                    break;
            }
        });
        if (reverseIn && typeof graph.forEachInEdge === 'function') {
            graph.forEachInEdge(path, (_edge, attrs, source, _target, _srcAttrs, _tgtAttrs) => {
                const dir = attrs?.dir;
                if (!this.isDirection(dir)) return;
                switch (dir) {
                    case 'down':
                        parents.push(source);
                        break;
                    case 'up':
                        children.push(source);
                        break;
                    case 'next':
                        prev.push(source);
                        break;
                    case 'prev':
                        next.push(source);
                        break;
                    case 'same':
                        siblings.push(source);
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
