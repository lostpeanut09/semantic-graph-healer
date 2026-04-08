import { App, EventRef, TAbstractFile, TFile, parseLinktext } from 'obsidian';
import { IMetadataAdapter } from './IMetadataAdapter';
import {
    DataviewApi,
    DataviewPage,
    HierarchyNode,
    MarkdownPage,
    RelatedNote,
    ExtendedApp,
    DatacoreApi,
    DataviewLink,
} from '../../types';
import { HealerLogger, isObsidianInternalApp } from '../HealerUtils';

/**
 * DatacoreLink internal interface for native Datacore link objects.
 */
interface DatacoreLink {
    path: string;
    display?: string;
    subpath?: string | null;
    embed?: boolean;
    type?: 'file' | 'header' | 'block';
    withDisplay?: (d: string) => DatacoreLink;
    toEmbed?: () => DatacoreLink;
    toObject?: () => Record<string, unknown>;
    toString?: () => string;
}

/**
 * Structural bridge types for Dataview parity.
 */
type MappedDataviewFile = {
    path: string;
    name: string;
    basename: string | undefined;
    folder: string;
    ext: string | undefined;
    ctime: unknown;
    mtime: unknown;
    cday: unknown;
    mday: unknown;
    day: unknown;
    size: number | undefined;
    etags: string[];
    tags: string[];
    aliases: string[];
    starred: boolean;
    link: DataviewLink;
    inlinks: DataviewLink[];
    outlinks: DataviewLink[];
    frontmatter: string[];
    tasks: Record<string, unknown>[];
    lists: Record<string, unknown>[];
};

type MappedDataviewPage = { file: MappedDataviewFile } & Record<string, unknown>;

/**
 * Coerces unknown values (number or Luxon DateTime) to milliseconds without
 * requiring a runtime dependency on Luxon.
 */
function coerceToMillis(v: unknown): number | null {
    if (typeof v === 'number') {
        if (!Number.isFinite(v)) return null;
        return v < 10000000000 ? v * 1000 : v;
    }
    if (v instanceof Date) {
        const ms = v.getTime();
        return Number.isFinite(ms) ? ms : null;
    }
    if (!isRecord(v)) return null;
    const fn = v['toMillis'];
    if (typeof fn !== 'function') return null;
    const result: unknown = Reflect.apply(fn, v, []);
    return typeof result === 'number' && Number.isFinite(result) ? result : null;
}

/**
 * Consolidates Dataview's field name sanitization logic (Docs-Aligned).
 */
function normalizeDataviewFieldName(key: string): string {
    return key
        .normalize('NFKC')
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]+/gu, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Type Guard: Safely identifies a value as a Record<string, unknown>.
 */
function isRecord(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Type Guard: Safely identifies a native Datacore link object.
 */
function isDatacoreLink(v: unknown): v is DatacoreLink {
    return isRecord(v) && typeof v['path'] === 'string';
}

/**
 * Defensive unwrap for internal Obsidian plugins.
 */
function unwrapInternalPluginInstance(raw: unknown): unknown {
    if (!isRecord(raw)) return null;
    return raw['instance'] ?? raw;
}

/**
 * Recursively searches a bookmark tree for a specific file path.
 */
function isPathBookmarked(items: unknown[], targetPath: string): boolean {
    for (const item of items) {
        if (!isRecord(item)) continue;
        if (item['type'] === 'file' && typeof item['path'] === 'string' && item['path'] === targetPath) {
            return true;
        }
        const subItems = item['items'];
        if ((item['type'] === 'group' || item['type'] === 'folder') && Array.isArray(subItems)) {
            if (isPathBookmarked(subItems, targetPath)) return true;
        }
    }
    return false;
}

/**
 * Truncate a date to midnight while preserving Luxon identity when possible.
 */
function coerceToStartOfDay(v: unknown, fallbackMillis: number): unknown {
    if (isRecord(v)) {
        const fn = v['startOf'];
        if (typeof fn === 'function') {
            const result: unknown = Reflect.apply(fn, v, ['day']);
            if (isRecord(result) && typeof result['toMillis'] === 'function') return result;
        }
    }
    const win = window as unknown as {
        luxon?: {
            DateTime?: {
                fromMillis(ms: number, opts?: { zone?: string }): { startOf(unit: string): unknown };
            };
        };
    };
    if (win.luxon?.DateTime && typeof win.luxon.DateTime.fromMillis === 'function') {
        const dt = win.luxon.DateTime.fromMillis(coerceToMillis(v) ?? fallbackMillis, { zone: 'local' });
        const startOfFn = dt['startOf'] as (unit: string) => unknown;
        return Reflect.apply(startOfFn, dt, ['day']);
    }
    const d = new Date(coerceToMillis(v) ?? fallbackMillis);
    d.setHours(0, 0, 0, 0);
    return d;
}

/**
 * Preserves Luxon identity for "Date with Time" objects when possible.
 */
function coerceToDateTime(v: unknown, fallbackMillis: number, dv?: { date?: (v: string) => unknown } | null): unknown {
    if (v instanceof Date) return Number.isNaN(v.getTime()) ? new Date(fallbackMillis) : v;
    if (isRecord(v) && typeof v['toMillis'] === 'function') return v;
    if (typeof v === 'string') {
        const normalized = /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v;
        if (dv && typeof dv.date === 'function') {
            try {
                const parsed = dv.date(normalized);
                if (parsed != null) return parsed;
            } catch {
                /* no-op */
            }
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
            const d = new Date(`${normalized}T00:00:00`);
            if (!Number.isNaN(d.getTime())) return d;
        }
        const d = new Date(normalized);
        if (!Number.isNaN(d.getTime())) return d;
    }
    const win = window as unknown as {
        luxon?: { DateTime?: { fromMillis(ms: number, opts?: { zone?: string }): unknown } };
    };
    if (win.luxon?.DateTime && typeof win.luxon.DateTime.fromMillis === 'function') {
        return win.luxon.DateTime.fromMillis(coerceToMillis(v) ?? fallbackMillis, { zone: 'local' });
    }
    return new Date(coerceToMillis(v) ?? fallbackMillis);
}

/**
 * DatacoreAdapter: Metadata bridge for Datacore integration.
 */
export class DatacoreAdapter implements IMetadataAdapter {
    private backlinkIndex: Map<string, Set<string>> | null = null;
    private linkCache = new Map<string, DataviewLink>();
    private pageChildrenCache = new Map<string, { tasks: unknown[]; lists: unknown[] }>();
    private resolveListenerRef: EventRef | null = null;
    private deletedListenerRef: EventRef | null = null;
    private cacheListenerRef: EventRef | null = null;
    private renameListenerRef: EventRef | null = null;
    private invalidationTimer: number | null = null;

    constructor(
        private app: App,
        private readonly debug: boolean = false,
    ) {
        // 'resolve' fires when individual files are resolved
        this.resolveListenerRef = this.app.metadataCache.on('resolve', () => {
            this.scheduleInvalidation();
        });
        // 'resolved' fires when all metadata is fully resolved (global batch complete)
        this.cacheListenerRef = this.app.metadataCache.on('resolved', () => {
            this.scheduleInvalidation();
        });
        // 'deleted' fires when a file is deleted
        this.deletedListenerRef = this.app.metadataCache.on('deleted', () => {
            this.scheduleInvalidation();
        });
        this.renameListenerRef = this.app.vault.on('rename', (_file: TAbstractFile, _oldPath: string) => {
            this.scheduleInvalidation();
        });
    }

    private scheduleInvalidation(): void {
        if (this.invalidationTimer !== null) {
            window.clearTimeout(this.invalidationTimer);
        }
        this.invalidationTimer = window.setTimeout(() => {
            this.invalidateBacklinkIndex();
            this.invalidationTimer = null;
        }, 250);
    }

    public destroy(): void {
        if (this.invalidationTimer !== null) {
            window.clearTimeout(this.invalidationTimer);
            this.invalidationTimer = null;
        }
        if (this.resolveListenerRef) {
            this.app.metadataCache.offref(this.resolveListenerRef);
            this.resolveListenerRef = null;
        }
        if (this.cacheListenerRef) {
            this.app.metadataCache.offref(this.cacheListenerRef);
            this.cacheListenerRef = null;
        }
        if (this.deletedListenerRef) {
            this.app.metadataCache.offref(this.deletedListenerRef);
            this.deletedListenerRef = null;
        }
        if (this.renameListenerRef) {
            this.app.vault.offref(this.renameListenerRef);
            this.renameListenerRef = null;
        }
        this.linkCache.clear();
        this.pageChildrenCache.clear();
        this.backlinkIndex = null;
    }

    private getApi(): DatacoreApi | null {
        if (!isObsidianInternalApp(this.app)) return null;
        const app = this.app as ExtendedApp;
        const plugin = app.plugins.getPlugin('datacore');
        const api = plugin && 'api' in plugin ? (plugin as { api: DatacoreApi }).api : null;
        if (api && typeof api.tryQuery === 'function') return api;
        if (this.debug) HealerLogger.warn('DatacoreAdapter: Datacore API (tryQuery) not ready yet.');
        return null;
    }

    /**
     * Type Guard: Verifies that a Datacore Indexable is a MarkdownPage using p.$types.
     */
    private isMarkdownPage(value: unknown): value is MarkdownPage {
        if (!isRecord(value)) return false;
        const types = value['$types'];
        if (Array.isArray(types)) {
            if (types.includes('page') && types.includes('markdown')) {
                return typeof value['value'] === 'function';
            }
        }
        return (
            typeof value['$path'] === 'string' &&
            typeof value['$name'] === 'string' &&
            typeof value['value'] === 'function'
        );
    }

    /**
     * Retrieves a single page by path using a robust query-first fallback strategy.
     */
    getPage(path: string): DataviewPage | null {
        const dc = this.getApi();
        if (!dc) return null;

        try {
            // Extract linkpath, discard subpath (heading/block) for consistency with normalizers
            const { path: linkpath } = parseLinktext(path);
            const input = linkpath || path;

            const resolvedPath =
                typeof dc['resolvePath'] === 'function'
                    ? (dc as unknown as { resolvePath: (p: string) => string }).resolvePath(input)
                    : input;

            const dcAny = dc as unknown as Record<string, unknown>;
            const pageFn = dcAny['page'];

            if (typeof pageFn === 'function') {
                const page: unknown = Reflect.apply(pageFn, dc, [resolvedPath]);
                if (page && this.isMarkdownPage(page)) {
                    return this.mapToDataviewPage(page);
                }
            }

            const query = `@page and $path = "${this.escapeDcString(resolvedPath)}"`;
            const result = dc.tryQuery<MarkdownPage>(query);

            if (isRecord(result) && result['successful'] && Array.isArray(result['value'])) {
                const page = result['value'][0];
                if (page && this.isMarkdownPage(page)) {
                    return this.mapToDataviewPage(page);
                }
            }

            return null;
        } catch (e) {
            HealerLogger.error('DatacoreAdapter: getPage failed (Exception)', e);
            return null;
        }
    }

    public invalidateBacklinkIndex(): void {
        this.backlinkIndex = null;
        this.linkCache.clear();
        this.pageChildrenCache.clear();
    }

    public getDataviewApi(): DataviewApi | null {
        if (!isObsidianInternalApp(this.app)) return null;
        const app = this.app as ExtendedApp;
        const plugin = app.plugins.getPlugin('dataview');
        return plugin && 'api' in plugin ? (plugin as { api: DataviewApi }).api : null;
    }

    private buildBacklinkIndex(): Map<string, Set<string>> {
        const idx = new Map<string, Set<string>>();
        const resolvedLinks = this.app.metadataCache.resolvedLinks;
        for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
            for (const targetPath of Object.keys(targets)) {
                if (!idx.has(targetPath)) idx.set(targetPath, new Set());
                idx.get(targetPath)!.add(sourcePath);
            }
        }
        return idx;
    }

    /**
     * Normalizes a vault path to absolute form for reliable lookup.
     */
    private normalizeVaultPath(path: string, sourcePath = ''): string {
        // Extract linkpath, discard subpath (heading/block)
        const { path: linkpath } = parseLinktext(path);

        const file = this.app.vault.getAbstractFileByPath(linkpath);
        if (file instanceof TFile) return file.path;

        const resolved = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
        return resolved?.path ?? linkpath;
    }

    public getBacklinks(targetPath: string): string[] {
        const normalized = this.normalizeVaultPath(targetPath);
        if (!this.backlinkIndex) {
            this.backlinkIndex = this.buildBacklinkIndex();
        }
        return Array.from(this.backlinkIndex.get(normalized) || []);
    }

    /**
     * Executes a metadata query with strict result filtering and error handling.
     */
    public getPages(query: string): DataviewPage[] {
        const api = this.getApi();
        if (!api) return [];
        if (!isRecord(api) || typeof api['tryQuery'] !== 'function') {
            HealerLogger.error('DatacoreAdapter: tryQuery not available — Datacore version mismatch.');
            return [];
        }
        try {
            const result = api.tryQuery<MarkdownPage>(query);
            if (isRecord(result) && !result['successful']) {
                HealerLogger.error('DatacoreAdapter: getPages query failed', result['error'] ?? 'Unknown error');
                return [];
            }
            const rawItems = isRecord(result) && Array.isArray(result['value']) ? result['value'] : [];
            const pages = rawItems.filter((item): item is MarkdownPage => this.isMarkdownPage(item));
            if (pages.length !== rawItems.length) {
                HealerLogger.warn(
                    `DatacoreAdapter: getPages filtered out ${rawItems.length - pages.length} non-page results`,
                );
            }
            if (pages.length > 0) {
                const uncachedPaths = pages.map((p) => p.$path).filter((path) => !this.pageChildrenCache.has(path));
                if (uncachedPaths.length > 0) {
                    this.prefetchChildrenForPaths(uncachedPaths);
                }
            }
            return pages.map((p) => this.mapToDataviewPage(p));
        } catch (e) {
            HealerLogger.error('DatacoreAdapter: getPages failed (Exception)', e);
            return [];
        }
    }

    /**
     * Prefetches all tasks and list items for a set of file paths.
     */
    private prefetchChildrenForPaths(paths: string[]): void {
        const dc = this.getApi();
        const uniquePaths = [...new Set(paths)];
        if (!dc || uniquePaths.length === 0) return;
        const staged = new Map<string, { tasks: unknown[]; lists: unknown[] }>(
            uniquePaths.map((p) => [p, { tasks: [], lists: [] }]),
        );
        const successful = new Set<string>();
        const pathChunks = this.chunkPathsForPrefetch(uniquePaths, 100);
        for (const chunk of pathChunks) {
            const pageFilter = chunk.map((p) => `$path = "${this.escapeDcString(p)}"`).join(' or ');
            const queryContext = `childof(@page and (${pageFilter}))`;
            const taskResult = dc.tryQuery<unknown>(`@task and ${queryContext}`);
            const listResult = dc.tryQuery<unknown>(`@list-item and ${queryContext}`);
            if (!this.isValidDcBatchResult(taskResult) || !this.isValidDcBatchResult(listResult)) {
                if (this.debug) HealerLogger.warn('DatacoreAdapter: Batch prefetch segment failed. Continuing.');
                continue;
            }
            for (const p of chunk) successful.add(p);
            this.distributePrefetchedNodes(taskResult['value'], 'tasks', staged);
            this.distributePrefetchedNodes(listResult['value'], 'lists', staged);
        }
        // Only cache paths that had successful queries
        for (const path of successful) {
            const data = staged.get(path);
            if (data) this.pageChildrenCache.set(path, data);
        }
    }

    private isValidDcBatchResult(res: unknown): res is { successful: true; value: unknown[] } {
        return isRecord(res) && res['successful'] === true && Array.isArray(res['value']);
    }

    private distributePrefetchedNodes(
        nodes: unknown[],
        kind: 'tasks' | 'lists',
        buckets: Map<string, { tasks: unknown[]; lists: unknown[] }>,
    ): void {
        for (const node of nodes) {
            const rawPath = this.readTaskImplicit(node, 'path');
            const filePath = typeof rawPath === 'string' ? rawPath : null;
            if (filePath && buckets.has(filePath)) {
                buckets.get(filePath)![kind].push(node);
            }
        }
    }

    private chunkPathsForPrefetch(paths: string[], max = 100): string[][] {
        const chunks: string[][] = [];
        for (let i = 0; i < paths.length; i += max) {
            chunks.push(paths.slice(i, i + max));
        }
        return chunks;
    }

    queryPages(_query: string): Promise<DataviewPage[]> {
        return Promise.resolve(this.getPages(_query));
    }

    getHierarchy(_path: string): Promise<HierarchyNode | null> {
        return Promise.resolve(null);
    }

    getRelatedNotes(_path: string, _limit: number): Promise<RelatedNote[]> {
        return Promise.resolve([]);
    }

    invalidate(_path?: string): void {
        this.invalidateBacklinkIndex();
    }

    /**
     * Expands hierarchical tags with safety for the '#' prefix.
     */
    private expandParentTags(tags: string[]): string[] {
        const expanded = new Set<string>();
        for (const rawTag of tags) {
            expanded.add(rawTag);
            const hasHash = rawTag.startsWith('#');
            const prefix = hasHash ? '#' : '';
            const tagBody = hasHash ? rawTag.slice(1) : rawTag;
            const parts = tagBody.split('/');
            for (let i = 1; i < parts.length; i++) {
                expanded.add(prefix + parts.slice(0, i).join('/'));
            }
        }
        return Array.from(expanded);
    }

    /**
     * State-aware factory for memoized DataviewLink objects.
     */
    private createDataviewLink(path: string, state: Partial<DataviewLink> = {}): DataviewLink {
        const isBase = Object.keys(state).length === 0;
        if (isBase && this.linkCache.has(path)) return this.linkCache.get(path)!;
        const link: DataviewLink = {
            path,
            display: undefined,
            subpath: null,
            embed: false,
            type: 'file',
            ...state,
            withDisplay: (d: string): DataviewLink => this.createDataviewLink(path, { ...link, display: d }),
            toEmbed: (): DataviewLink => this.createDataviewLink(path, { ...link, embed: true }),
            toObject: (): Record<string, unknown> => ({
                path: link.path,
                display: link.display,
                subpath: link.subpath,
                embed: link.embed,
                type: link.type,
            }),
            toString: (): string => link.display ?? link.path,
        };
        if (isBase) this.linkCache.set(path, link);
        return link;
    }

    private stringifyFrontmatterFallback(value: unknown): string {
        if (typeof value === 'string') return value;
        try {
            const json = JSON.stringify(value);
            return typeof json === 'string' ? json : String(value);
        } catch {
            return String(value);
        }
    }

    /**
     * Raw-faithful frontmatter mapping for Dataview parity.
     */
    private buildFrontmatter(p: MarkdownPage): string[] {
        const fm = p.$frontmatter;
        if (!isRecord(fm)) return [];
        return Object.entries(fm).map(([fallbackKey, entry]) => {
            const key = isRecord(entry) && typeof entry['key'] === 'string' ? entry['key'] : fallbackKey;
            if (isRecord(entry) && typeof entry['key'] === 'string' && typeof entry['raw'] === 'string') {
                return `${key} | ${entry['raw']}`;
            }
            if (isRecord(entry) && 'value' in entry) {
                return `${key} | ${this.stringifyFrontmatterFallback(entry['value'])}`;
            }
            return `${key} | ${this.stringifyFrontmatterFallback(entry)}`;
        });
    }

    /**
     * Semantic Mapping Architecture: MarkdownPage (Datacore) -> DataviewPage (Bridge).
     */
    private mapToDataviewPage(p: MarkdownPage): DataviewPage {
        const folder = p.$path.includes('/') ? p.$path.slice(0, p.$path.lastIndexOf('/')) : '';
        const rawTags = p.$tags || [];
        const sidebarName = p.$name;
        const inheritedPageFields = this.extractUserFields(p);
        const inlinks = this.getBacklinks(p.$path).map((path) => this.createDataviewLink(path));
        const selfLinkData = isDatacoreLink(p.$link) ? p.$link : { path: p.$path, type: 'file' as const };
        let ctime = p.$ctime;
        let mtime = p.$mtime;
        if (ctime == null || mtime == null) {
            const file = this.app.vault.getAbstractFileByPath(p.$path);
            if (file instanceof TFile) {
                ctime = ctime ?? file.stat.ctime;
                mtime = mtime ?? file.stat.mtime;
            }
        }
        const ctimeNum: number = coerceToMillis(ctime) ?? Date.now();
        const mtimeNum: number = coerceToMillis(mtime) ?? Date.now();
        const dv = this.getDataviewApi() as { date?: (v: string) => unknown } | null;
        const ctimeVal = coerceToDateTime(ctime, ctimeNum, dv);
        const mtimeVal = coerceToDateTime(mtime, mtimeNum, dv);
        const cday = coerceToStartOfDay(ctimeVal, ctimeNum);
        const mday = coerceToStartOfDay(mtimeVal, mtimeNum);
        const fileDay = this.parseFileDayDocsAligned(p);
        const starred = this.isFileBookmarked(p.$path) || this.isFileStarredLegacy(p.$path);

        const rawAliases: unknown = p.$frontmatter?.aliases ?? p.$frontmatter?.alias;
        let yamlAliases: string[] = [];
        if (Array.isArray(rawAliases)) {
            yamlAliases = rawAliases.filter((v): v is string => typeof v === 'string' && v.length > 0);
        } else if (typeof rawAliases === 'string' && rawAliases.length > 0) {
            yamlAliases = [rawAliases];
        } else if (isRecord(rawAliases) && 'value' in rawAliases) {
            const val: unknown = rawAliases['value'];
            if (Array.isArray(val)) {
                yamlAliases = val.filter((v): v is string => typeof v === 'string' && v.length > 0);
            } else if (typeof val === 'string' && val.length > 0) {
                yamlAliases = [val];
            }
        }

        const pageOutlinks = (Array.isArray(p.$links) ? p.$links : [])
            .filter(isDatacoreLink)
            .map((l) => this.createDataviewLink(l.path, this.sanitizeLinkState(l)));

        const pageFrontmatter = this.buildFrontmatter(p);

        const tasksAndLists = this.buildTasksAndLists(
            p,
            folder,
            rawTags,
            yamlAliases,
            starred,
            ctimeVal,
            mtimeVal,
            cday,
            mday,
            fileDay,
            inlinks,
            pageOutlinks,
            pageFrontmatter,
            inheritedPageFields,
        );

        const mapped = {
            file: {
                path: p.$path,
                name: sidebarName,
                basename: p.$name,
                folder,
                ext: p.$extension,
                ctime: ctimeVal,
                mtime: mtimeVal,
                cday,
                mday,
                day: fileDay,
                size: p.$size,
                etags: [...rawTags],
                tags: this.expandParentTags(rawTags),
                aliases: yamlAliases,
                starred,
                link: this.createDataviewLink(selfLinkData.path, this.sanitizeLinkState(selfLinkData)),
                inlinks,
                outlinks: pageOutlinks,
                frontmatter: pageFrontmatter,
                tasks: tasksAndLists.tasks,
                lists: tasksAndLists.lists,
            },
            ...inheritedPageFields,
        } satisfies MappedDataviewPage;

        return mapped as unknown as DataviewPage;
    }

    /**
     * Strict Date Parsing aligned with Dataview inference.
     */
    private normalizeStrictDateString(value: string): string | null {
        const v = value.trim();
        if (/^\d{8}$/.test(v)) {
            return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
        }
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.test(v)) {
            return v;
        }
        return null;
    }

    private parseDateStrict(value: unknown, opts: { allowEpochNumbers?: boolean } = {}): unknown {
        if (value == null) return undefined;
        if (value instanceof Date) {
            return Number.isNaN(value.getTime()) ? undefined : value;
        }
        if (typeof value === 'number') {
            if (!Number.isFinite(value)) return undefined;
            if (!opts.allowEpochNumbers) return undefined;
            const ms = value < 10000000000 ? value * 1000 : value;
            return coerceToDateTime(ms, ms);
        }
        if (isRecord(value) && typeof value['toMillis'] === 'function') {
            return value;
        }
        if (typeof value !== 'string') return undefined;

        const normalized = this.normalizeStrictDateString(value);
        if (!normalized) return undefined;

        const dc = this.getApi();
        const coerce = isRecord(dc) ? dc['coerce'] : null;
        if (isRecord(coerce) && typeof coerce['date'] === 'function') {
            try {
                const parsed = Reflect.apply(coerce['date'] as (...args: unknown[]) => unknown, coerce, [normalized]);
                if (parsed != null) return parsed;
            } catch {
                /* no-op */
            }
        }

        const dv = this.getDataviewApi() as { date?: (v: string) => unknown } | null;
        if (dv && typeof dv.date === 'function') {
            try {
                const parsed = dv.date(normalized);
                if (parsed != null) return parsed;
            } catch {
                /* no-op */
            }
        }

        if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
            const d = new Date(`${normalized}T00:00:00`);
            return Number.isNaN(d.getTime()) ? undefined : d;
        }

        const d = new Date(normalized);
        return Number.isNaN(d.getTime()) ? undefined : d;
    }

    /**
     * Resolves file.day with robust fallback (Filename -> Date field).
     * Tries both filename date AND Date field to handle invalid date-like text in filename.
     */
    private parseFileDayDocsAligned(p: MarkdownPage): unknown {
        const titleMatch = p.$name.match(/\b(\d{4}-\d{2}-\d{2}|\d{8})\b/);
        const candidates: unknown[] = [titleMatch?.[0], this.resolveFileDayFieldCandidate(p)];

        for (const candidate of candidates) {
            if (candidate == null) continue;

            const parsed = this.parseDateStrict(candidate, { allowEpochNumbers: false });
            if (parsed == null) continue;

            const ms = coerceToMillis(parsed);
            if (ms == null) continue;

            return coerceToStartOfDay(parsed, ms);
        }

        return undefined;
    }

    /**
     * Robust discovery for any field that normalizes to 'date'.
     */
    private resolveFileDayFieldCandidate(p: MarkdownPage): unknown {
        const direct = p.value('date');
        if (direct != null) return direct;
        const sources = [p.$frontmatter, p.$infields];
        for (const source of sources) {
            if (!isRecord(source)) continue;
            for (const rawKey of Object.keys(source)) {
                if (normalizeDataviewFieldName(rawKey) === 'date') {
                    const value = p.value(rawKey);
                    if (value !== undefined) return value;
                }
            }
        }
        return undefined;
    }

    /**
     * Identifies Dataview reserved keys that should not be overwritten by user fields.
     * Also protects against aliases that normalize to 'file'.
     */
    private isReservedTopLevelKey(rawKey: string): boolean {
        const raw = rawKey.trim();
        if (raw.toLowerCase() === 'file') return true;
        const normalized = normalizeDataviewFieldName(raw);
        return normalized === 'file';
    }

    /**
     * Extracts final metadata values via p.value(key) to match Dataview behavior.
     */
    private extractUserFields(p: MarkdownPage): Record<string, unknown> {
        const fm = p.$frontmatter;
        const infields = p.$infields;
        const frontmatterKeys = isRecord(fm) ? Object.keys(fm) : [];
        const inlineKeys = isRecord(infields) ? Object.keys(infields) : [];
        const allUserKeys = new Set([...frontmatterKeys, ...inlineKeys]);
        const out: Record<string, unknown> = {};
        for (const key of allUserKeys) {
            if (this.isReservedTopLevelKey(key)) continue;
            const val = p.value(key);
            if (val === undefined) continue;
            this.writeFieldAliases(out, key, val);
        }
        return out;
    }

    /**
     * Sanitizes a DatacoreLink for conversion to a DataviewLink partial state.
     */
    private sanitizeLinkState(l: DatacoreLink): Partial<DataviewLink> {
        return {
            path: l.path,
            display: l.display,
            subpath: l.subpath ?? null,
            embed: l.embed ?? false,
            type: l.type ?? 'file',
        };
    }

    /**
     * Reconstructs Tasks/Lists metadata for Dataview parity.
     * Includes tasks and lists in task.file for complete Dataview parity.
     */
    private buildTasksAndLists(
        p: MarkdownPage,
        folder: string,
        rawTags: string[],
        yamlAliases: string[],
        starred: boolean,
        ctime: unknown,
        mtime: unknown,
        cday: unknown,
        mday: unknown,
        day: unknown,
        inlinks: DataviewLink[],
        outlinks: DataviewLink[],
        frontmatter: string[],
        inheritedPageFields: Record<string, unknown>,
    ): {
        tasks: Record<string, unknown>[];
        lists: Record<string, unknown>[];
    } {
        const fileContext = this.buildTaskFileContext(
            p,
            folder,
            rawTags,
            yamlAliases,
            starred,
            ctime,
            mtime,
            cday,
            mday,
            day,
            inlinks,
            outlinks,
            frontmatter,
        );

        const children = this.getPageChildren(p.$path);
        const mappedTasks = children.tasks.map((n) => this.mapTaskLike(n, p, fileContext, inheritedPageFields));
        const mappedListItems = children.lists.map((n) => this.mapTaskLike(n, p, fileContext, inheritedPageFields));

        const tasks = this.materializeTaskForest(mappedTasks);
        const lists = this.materializeTaskForest(this.dedupeTaskLikes([...mappedListItems, ...mappedTasks]));

        // Add tasks and lists to fileContext for full Dataview parity
        fileContext.tasks = tasks;
        fileContext.lists = lists;

        // Ensure every item in the forest refers to the now-complete file context
        for (const item of [...tasks, ...lists]) {
            item.file = fileContext;
        }

        return { tasks, lists };
    }

    private getPageChildren(path: string): { tasks: unknown[]; lists: unknown[] } {
        const cached = this.pageChildrenCache.get(path);
        if (cached) return cached;
        const tasks = this.queryPageChildren('@task', path);
        const lists = this.queryPageChildren('@list-item', path);

        // Only cache if both queries succeed - avoid partial cache poisoning
        if (tasks !== null && lists !== null) {
            const value = { tasks, lists };
            this.pageChildrenCache.set(path, value);
            return value;
        }

        // Partial failure: return best-effort but don't cache
        return {
            tasks: tasks ?? [],
            lists: lists ?? [],
        };
    }

    private queryPageChildren(type: '@task' | '@list-item', pagePath: string): unknown[] | null {
        const dc = this.getApi();
        if (!dc) return null;
        const query = `${type} and childof(@page and $path = "${this.escapeDcString(pagePath)}")`;
        const result = dc.tryQuery<unknown>(query);
        return isRecord(result) && result['successful'] && Array.isArray(result['value']) ? result['value'] : null;
    }

    private escapeDcString(value: string): string {
        return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    }

    /**
     * Maps a Datacore node into the Dataview Task/ListItem schema.
     */
    private mapTaskLike(
        node: unknown,
        page: MarkdownPage,
        fileContext: Record<string, unknown>,
        inheritedPageFields: Record<string, unknown>,
    ): Record<string, unknown> {
        const ownTaskFields = this.extractIndexableUserFields(node);
        const nodeTypes = isRecord(node) && Array.isArray(node['$types']) ? (node['$types'] as string[]) : [];
        const pathRaw = this.readTaskImplicit(node, 'path');
        const path = typeof pathRaw === 'string' ? pathRaw : page.$path;
        const lineRaw = this.readTaskImplicit(node, 'line');
        const lineNum = typeof lineRaw === 'number' && Number.isFinite(lineRaw) ? lineRaw : null;
        const blockIdRaw = this.readTaskImplicit(node, 'blockId');
        const blockId = typeof blockIdRaw === 'string' && blockIdRaw.length > 0 ? blockIdRaw : null;
        const outlinks = this.extractTaskOutlinks(node);
        const tags = this.extractTaskTags(node);
        const section = this.deriveTaskSection(page, lineNum, node);
        const rawStatus = this.readTaskImplicit(node, 'status');
        const status = typeof rawStatus === 'string' && rawStatus.length > 0 ? rawStatus : ' ';
        const rawCompleted = this.readTaskImplicit(node, 'completed');
        const completed = typeof rawCompleted === 'boolean' ? rawCompleted : status.toLowerCase() === 'x';
        const checked = status.trim().length > 0;
        const parent = this.normalizeParentLine(node);
        const task = nodeTypes.includes('task');
        const link = this.makeTaskLink(node, path, blockId, section);
        const textRaw = this.readTaskImplicit(node, 'text');
        const text = typeof textRaw === 'string' ? textRaw : '';
        const visualRaw = this.readDirectIndexableMember(node, 'visual');
        const visual = typeof visualRaw === 'string' ? visualRaw : text;
        const lineCountRaw = this.readTaskImplicit(node, 'lineCount');
        const lineCount =
            typeof lineCountRaw === 'number' && Number.isFinite(lineCountRaw) && lineCountRaw > 0 ? lineCountRaw : 1;

        return {
            ...inheritedPageFields,
            ...ownTaskFields,
            status,
            checked,
            completed,
            fullyCompleted: completed,
            text,
            visual,
            line: lineNum,
            lineCount,
            path,
            section,
            tags,
            outlinks,
            link,
            children: [] as Record<string, unknown>[],
            task,
            annotated: this.isAnnotatedTask(node),
            parent,
            blockId,
            completion: this.readIndexableField(node, 'completion'),
            due: this.readIndexableField(node, 'due'),
            created: this.readIndexableField(node, 'created'),
            start: this.readIndexableField(node, 'start'),
            scheduled: this.readIndexableField(node, 'scheduled'),
            file: fileContext,
        };
    }

    /**
     * Reads structural implicit fields from direct node members only.
     */
    private readTaskImplicit(
        node: unknown,
        key: 'path' | 'line' | 'lineCount' | 'links' | 'tags' | 'text' | 'blockId' | 'parent' | 'status' | 'completed',
    ): unknown {
        if (!isRecord(node)) return undefined;

        switch (key) {
            case 'path':
                return typeof node['$file'] === 'string' ? node['$file'] : undefined;
            case 'line':
                return typeof node['$line'] === 'number' && Number.isFinite(node['$line']) ? node['$line'] : undefined;
            case 'lineCount':
                return typeof node['$lineCount'] === 'number' && Number.isFinite(node['$lineCount'])
                    ? node['$lineCount']
                    : undefined;
            case 'links':
                return Array.isArray(node['$links']) ? node['$links'] : undefined;
            case 'tags':
                return Array.isArray(node['$tags']) ? node['$tags'] : undefined;
            case 'text':
                return typeof node['$text'] === 'string' ? node['$text'] : undefined;
            case 'blockId':
                return typeof node['$blockId'] === 'string' ? node['$blockId'] : undefined;
            case 'parent':
                return typeof node['$parentLine'] === 'number' && Number.isFinite(node['$parentLine'])
                    ? node['$parentLine']
                    : undefined;
            case 'status':
                return typeof node['$status'] === 'string' ? node['$status'] : undefined;
            case 'completed':
                return typeof node['$completed'] === 'boolean' ? node['$completed'] : undefined;
            default:
                return undefined;
        }
    }

    private isAnnotatedTask(node: unknown): boolean {
        if (!isRecord(node)) return false;

        const native = node['$annotated'];
        if (typeof native === 'boolean') return native;

        const infields = node['$infields'];
        if (isRecord(infields) && Object.keys(infields).length > 0) return true;

        const fields = node['fields'];
        if (Array.isArray(fields)) {
            return fields.some((f) => {
                if (!isRecord(f)) return false;
                const prov = f['provenance'];
                return isRecord(prov) && prov['type'] === 'inline-field';
            });
        }

        return false;
    }

    private extractTaskOutlinks(node: unknown): DataviewLink[] {
        const raw = this.readTaskImplicit(node, 'links');
        return Array.isArray(raw)
            ? raw.filter(isDatacoreLink).map((l) => this.createDataviewLink(l.path, this.sanitizeLinkState(l)))
            : [];
    }

    private extractTaskTags(node: unknown): string[] {
        const raw = this.readTaskImplicit(node, 'tags');
        return Array.isArray(raw) ? raw.filter((t): t is string => typeof t === 'string') : [];
    }

    /**
     * Discovers the closest section header above this task line.
     * BEST-EFFORT IMPLEMENTATION.
     */
    private deriveTaskSection(page: MarkdownPage, line: number | null, node: unknown): DataviewLink | null {
        const rawSection = this.readDirectIndexableMember(node, 'section');
        if (isDatacoreLink(rawSection)) {
            return this.createDataviewLink(rawSection.path, this.sanitizeLinkState(rawSection));
        }
        if (line == null || !Array.isArray(page.$sections)) return null;

        let bestSection: DataviewLink | null = null;
        let lastHeaderLine = -1;

        for (const section of page.$sections) {
            if (!isRecord(section)) continue;
            const pos = section['$position'];
            const link = section['$link'];
            if (!isRecord(pos) || !isDatacoreLink(link)) continue;

            const startLine =
                typeof pos['start'] === 'number'
                    ? pos['start']
                    : isRecord(pos['start']) && typeof pos['start']['line'] === 'number'
                      ? pos['start']['line']
                      : null;

            if (startLine != null && startLine <= line && startLine > lastHeaderLine) {
                lastHeaderLine = startLine;
                bestSection = this.createDataviewLink(link.path, this.sanitizeLinkState(link));
            }
        }

        return bestSection;
    }

    private normalizeParentLine(node: unknown): number | null {
        const parent = this.readTaskImplicit(node, 'parent');
        return typeof parent === 'number' && Number.isFinite(parent) && parent >= 0 ? parent : null;
    }

    /**
     * Generates a high-precision DataviewLink for a task.
     */
    private makeTaskLink(
        node: unknown,
        path: string,
        blockId: string | null,
        section: DataviewLink | null,
    ): DataviewLink {
        const rawLink = this.readDirectIndexableMember(node, 'link');
        if (isDatacoreLink(rawLink)) {
            return this.createDataviewLink(rawLink.path, this.sanitizeLinkState(rawLink));
        }
        const dc = this.getApi();
        const dcAny = dc as unknown as Record<string, unknown>;
        const blockLinkFn = dcAny?.['blockLink'];

        if (dc && blockId && typeof blockLinkFn === 'function') {
            try {
                const native: unknown = Reflect.apply(blockLinkFn, dc, [path, blockId]);
                if (isDatacoreLink(native)) {
                    return this.createDataviewLink(native.path, this.sanitizeLinkState(native));
                }
            } catch {
                /* no-op */
            }
        }

        if (section) return section;
        return this.createDataviewLink(path);
    }

    /**
     * Reads semantic fields using Datacore's value() first, which supports inheritance.
     */
    private readIndexableField(obj: unknown, key: string): unknown {
        if (!isRecord(obj)) return undefined;
        const valueFn = obj['value'];
        if (typeof valueFn === 'function') {
            try {
                const val: unknown = Reflect.apply(valueFn, obj, [key]);
                if (val !== undefined) return val;
            } catch {
                /* no-op */
            }
        }
        return this.readDirectIndexableMember(obj, key);
    }

    /**
     * Reads only direct node members; bypasses inherited page metadata.
     */
    private readDirectIndexableMember(obj: unknown, key: string): unknown {
        if (!isRecord(obj)) return undefined;
        if (Object.prototype.hasOwnProperty.call(obj, `$${key}`)) return obj[`$${key}`];
        if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
        return undefined;
    }

    private sortTaskLikes(items: Record<string, unknown>[]): Record<string, unknown>[] {
        return [...items].sort((a, b) => {
            const la = typeof a['line'] === 'number' ? a['line'] : Number.MAX_SAFE_INTEGER;
            const lb = typeof b['line'] === 'number' ? b['line'] : Number.MAX_SAFE_INTEGER;
            return la - lb;
        });
    }

    private buildTaskFileContext(
        p: MarkdownPage,
        folder: string,
        rawTags: string[],
        yamlAliases: string[],
        starred: boolean,
        ctime: unknown,
        mtime: unknown,
        cday: unknown,
        mday: unknown,
        day: unknown,
        inlinks: DataviewLink[],
        outlinks: DataviewLink[],
        frontmatter: string[],
    ): Record<string, unknown> {
        return {
            path: p.$path,
            name: p.$name,
            basename: p.$name,
            folder,
            ext: p.$extension,
            ctime,
            mtime,
            cday,
            mday,
            day,
            size: p.$size,
            etags: [...rawTags],
            tags: this.expandParentTags(rawTags),
            aliases: yamlAliases,
            starred,
            link: this.createDataviewLink(p.$path),
            inlinks,
            outlinks,
            frontmatter,
        };
    }

    private extractIndexableUserFields(obj: unknown): Record<string, unknown> {
        if (!isRecord(obj)) return {};
        const infields = obj['$infields'];
        if (!isRecord(infields)) return {};
        const out: Record<string, unknown> = {};
        const valueFn = obj['value'];
        for (const rawKey of Object.keys(infields)) {
            if (this.isReservedTopLevelKey(rawKey)) continue;
            let val: unknown = undefined;
            if (typeof valueFn === 'function') {
                try {
                    val = Reflect.apply(valueFn, obj, [rawKey]);
                } catch {
                    /* no-op */
                }
            }
            if (val !== undefined) {
                this.writeFieldAliases(out, rawKey, val);
            }
        }
        return out;
    }

    private materializeTaskForest(items: Record<string, unknown>[]): Record<string, unknown>[] {
        const clones: Record<string, unknown>[] = this.sortTaskLikes(items).map((item) => ({
            ...item,
            children: [] as Record<string, unknown>[],
        }));

        const byLine = new Map<number, Record<string, unknown>>();
        for (const item of clones) {
            const line: unknown = item['line'];
            if (typeof line === 'number') byLine.set(line, item);
        }

        for (const item of clones) {
            const parent: unknown = item['parent'];
            if (typeof parent !== 'number') continue;
            const owner = byLine.get(parent);
            if (owner && Array.isArray(owner['children'])) {
                (owner['children'] as Record<string, unknown>[]).push(item);
            }
        }

        return this.finalizeFullyCompleted(clones);
    }

    private finalizeFullyCompleted(items: Record<string, unknown>[]): Record<string, unknown>[] {
        const lines = new Set<number>();
        for (const item of items) {
            const line = item['line'];
            if (typeof line === 'number') lines.add(line);
        }

        const visit = (item: Record<string, unknown>): boolean => {
            const children = Array.isArray(item['children']) ? (item['children'] as Record<string, unknown>[]) : [];
            const ownCompleted = Boolean(item['completed']);
            const childrenCompleted = children.every(visit);
            item['fullyCompleted'] = ownCompleted && childrenCompleted;
            return Boolean(item['fullyCompleted']);
        };

        for (const item of items) {
            const parent = item['parent'];
            const isRootLike = typeof parent !== 'number' || !lines.has(parent);
            if (isRootLike) visit(item);
        }

        return items;
    }

    private mergeField(out: Record<string, unknown>, key: string, value: unknown): void {
        if (!key) return;
        if (!(key in out)) {
            out[key] = value;
            return;
        }
        const current = out[key];
        if (Object.is(current, value)) return;
        out[key] = Array.isArray(current) ? [...(current as unknown[]), value] : [current, value];
    }

    private writeFieldAliases(out: Record<string, unknown>, rawKey: string, value: unknown): void {
        const raw = rawKey.trim();
        const normalized = normalizeDataviewFieldName(raw);
        const aliases = new Set<string>();
        if (raw) aliases.add(raw);
        if (normalized) aliases.add(normalized);
        for (const alias of aliases) {
            this.mergeField(out, alias, value);
        }
    }

    private dedupeTaskLikes(items: Record<string, unknown>[]): Record<string, unknown>[] {
        const seen = new Set<string>();
        const out: Record<string, unknown>[] = [];
        for (const item of items) {
            const id = this.taskLikeIdentity(item);
            if (seen.has(id)) continue;
            seen.add(id);
            out.push(item);
        }
        return out;
    }

    private taskLikeIdentity(item: Record<string, unknown>): string {
        const path = typeof item['path'] === 'string' ? item['path'] : '';
        const line = typeof item['line'] === 'number' ? item['line'] : -1;
        const blockId = typeof item['blockId'] === 'string' ? item['blockId'] : '';
        return `${path}::${line}::${blockId}`;
    }

    private isFileBookmarked(path: string): boolean {
        const iApp = this.app as App & {
            internalPlugins?: { getEnabledPluginById?: (id: string) => unknown };
        };
        const getter = iApp.internalPlugins?.getEnabledPluginById;
        if (typeof getter !== 'function') return false;
        try {
            const bookmarksInst = unwrapInternalPluginInstance(getter.call(iApp.internalPlugins, 'bookmarks'));
            if (isRecord(bookmarksInst) && Array.isArray(bookmarksInst['items'])) {
                return isPathBookmarked(bookmarksInst['items'], path);
            }
        } catch (e) {
            if (this.debug) HealerLogger.warn('Bookmarks internal API unavailable', e);
        }
        return false;
    }

    private isFileStarredLegacy(path: string): boolean {
        const iApp = this.app as App & {
            internalPlugins?: { getEnabledPluginById?: (id: string) => unknown };
        };
        const getter = iApp.internalPlugins?.getEnabledPluginById;
        if (typeof getter !== 'function') return false;
        try {
            const starredInst = unwrapInternalPluginInstance(getter.call(iApp.internalPlugins, 'starred'));
            if (isRecord(starredInst)) {
                const items = starredInst['items'];
                if (isRecord(items) && items[path]) return true;
            }
        } catch {
            /* Starred plugin not found or unsupported shape */
        }
        return false;
    }
}
