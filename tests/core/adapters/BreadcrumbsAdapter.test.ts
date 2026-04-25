// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/core/HealerUtils', () => ({
    HealerLogger: {
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
    isObsidianInternalApp: vi.fn(() => true),
}));

vi.mock('obsidian', () => ({
    App: class MockApp {},
    TFile: class MockTFile {
        path: string;
        stat: { ctime: number; mtime: number };

        constructor(path = 'test/note.md') {
            this.path = path;
            this.stat = {
                ctime: new Date('2026-01-01T10:00:00Z').getTime(),
                mtime: new Date('2026-01-02T10:00:00Z').getTime(),
            };
        }
    },
    parseLinktext: vi.fn((value: string) => {
        const idx = value.indexOf('#');
        if (idx === -1) return { path: value, subpath: '' };
        return {
            path: value.slice(0, idx),
            subpath: value.slice(idx),
        };
    }),
}));

import { BreadcrumbsAdapter } from '../../../src/core/adapters/BreadcrumbsAdapter';
import { TFile, type App, parseLinktext } from 'obsidian';

interface MockBreadcrumbsApi {
    getMatrixNeighbours?: (path: string, dirs: readonly string[]) => unknown;
    closedG?: unknown;
    mainG?: unknown;
    DIRECTIONS?: readonly string[];
}

interface Edge {
    source: string;
    target: string;
    attrs: Record<string, unknown>;
}

interface MockGraph {
    order: number;
    hasNode: (node: string) => boolean;
    forEachOutEdge: (
        node: string,
        cb: (
            edge: string,
            attrs: Record<string, unknown>,
            source: string,
            target: string,
            sourceAttrs?: Record<string, unknown>,
            targetAttrs?: Record<string, unknown>,
        ) => void,
    ) => void;
    forEachInEdge?: (
        node: string,
        cb: (
            edge: string,
            attrs: Record<string, unknown>,
            source: string,
            target: string,
            sourceAttrs?: Record<string, unknown>,
            targetAttrs?: Record<string, unknown>,
        ) => void,
    ) => void;
}

describe('BreadcrumbsAdapter', () => {
    let adapter: BreadcrumbsAdapter;
    let mockApp: App;

    const makeTFile = (path: string): TFile => new (TFile as any)(path) as TFile;

    const createMockApi = (overrides: Partial<MockBreadcrumbsApi> = {}): MockBreadcrumbsApi => ({
        closedG: null,
        mainG: null,
        DIRECTIONS: ['up', 'same', 'down', 'next', 'prev'],
        ...overrides,
    });

    const createGraph = ({
        hasNode = () => false,
        outEdges = [],
        inEdges = [],
    }: {
        hasNode?: (node: string) => boolean;
        outEdges?: Edge[];
        inEdges?: Edge[];
    } = {}): MockGraph => ({
        order: 1,
        hasNode,
        forEachOutEdge: (node, cb) => {
            outEdges.forEach((e, i) => {
                if (e.source === node) {
                    cb(`out-${i}`, e.attrs, e.source, e.target, {}, {});
                }
            });
        },
        forEachInEdge: (node, cb) => {
            inEdges.forEach((e, i) => {
                if (e.target === node) {
                    cb(`in-${i}`, e.attrs, e.source, e.target, {}, {});
                }
            });
        },
    });

    beforeEach(() => {
        mockApp = {
            metadataCache: {
                getFirstLinkpathDest: vi.fn((p: string) => {
                    if (p === 'note') return makeTFile('test/note.md');
                    if (p === 'parent') return makeTFile('folder/parent.md');
                    if (p === 'child') return makeTFile('folder/child.md');
                    if (p === 'peer') return makeTFile('folder/peer.md');
                    return null;
                }),
            },
            vault: {
                getAbstractFileByPath: vi.fn((p: string) => {
                    if (p === 'test/note.md') return makeTFile('test/note.md');
                    if (p === 'folder/parent.md') return makeTFile('folder/parent.md');
                    if (p === 'folder/child.md') return makeTFile('folder/child.md');
                    if (p === 'folder/peer.md') return makeTFile('folder/peer.md');
                    return null;
                }),
            },
            plugins: {
                getPlugin: vi.fn(() => ({ api: createMockApi() })),
            },
        } as unknown as App;

        adapter = new BreadcrumbsAdapter(mockApp);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('uses direct full path when file exists in vault', async () => {
        const getMatrixNeighbours = vi.fn().mockReturnValue({
            up: [],
            down: [],
            same: [],
            next: [],
            prev: [],
        });

        (mockApp.plugins.getPlugin as ReturnType<typeof vi.fn>).mockReturnValue({
            api: createMockApi({ getMatrixNeighbours }),
        });

        await adapter.getHierarchy('test/note.md');

        expect(mockApp.vault.getAbstractFileByPath).toHaveBeenCalledWith('test/note.md');
        expect(getMatrixNeighbours).toHaveBeenCalledWith('test/note.md', ['up', 'same', 'down', 'next', 'prev']);
    });

    it('resolves short path to full path', async () => {
        const getMatrixNeighbours = vi.fn().mockReturnValue({
            up: [],
            down: [],
            same: [],
            next: [],
            prev: [],
        });

        (mockApp.plugins.getPlugin as ReturnType<typeof vi.fn>).mockReturnValue({
            api: createMockApi({ getMatrixNeighbours }),
        });

        await adapter.getHierarchy('note');

        expect(mockApp.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith('note', '');
        expect(getMatrixNeighbours).toHaveBeenCalledWith('test/note.md', ['up', 'same', 'down', 'next', 'prev']);
    });

    it('strips heading subpath before resolving', async () => {
        const getMatrixNeighbours = vi.fn().mockReturnValue({
            up: [],
            down: [],
            same: [],
            next: [],
            prev: [],
        });

        (mockApp.plugins.getPlugin as ReturnType<typeof vi.fn>).mockReturnValue({
            api: createMockApi({ getMatrixNeighbours }),
        });

        await adapter.getHierarchy('note#Heading');

        expect(parseLinktext).toHaveBeenCalledWith('note#Heading');
        expect(mockApp.metadataCache.getFirstLinkpathDest).toHaveBeenCalledWith('note', '');
        expect(getMatrixNeighbours).toHaveBeenCalledWith('test/note.md', ['up', 'same', 'down', 'next', 'prev']);
    });

    it('falls back from matrix to closedG', async () => {
        const getMatrixNeighbours = vi.fn().mockReturnValue(null);
        const closedG = createGraph({
            hasNode: (n) => n === 'test/note.md',
            outEdges: [
                {
                    source: 'test/note.md',
                    target: 'folder/parent.md',
                    attrs: { dir: 'up' },
                },
            ],
        });

        (mockApp.plugins.getPlugin as ReturnType<typeof vi.fn>).mockReturnValue({
            api: createMockApi({ getMatrixNeighbours, closedG }),
        });

        const result = await adapter.getHierarchy('note');

        expect(result).not.toBeNull();
        expect(result!.parents).toContain('folder/parent.md');
    });

    it('falls back from closedG to mainG', async () => {
        const getMatrixNeighbours = vi.fn().mockReturnValue(null);
        const closedG = createGraph({ hasNode: () => false });
        const mainG = createGraph({
            hasNode: (n) => n === 'test/note.md',
            outEdges: [
                {
                    source: 'test/note.md',
                    target: 'folder/child.md',
                    attrs: { dir: 'down' },
                },
            ],
        });

        (mockApp.plugins.getPlugin as ReturnType<typeof vi.fn>).mockReturnValue({
            api: createMockApi({ getMatrixNeighbours, closedG, mainG }),
        });

        const result = await adapter.getHierarchy('note');

        expect(result).not.toBeNull();
        expect(result!.children).toContain('folder/child.md');
    });

    it('reverses incoming edges on mainG', async () => {
        const getMatrixNeighbours = vi.fn().mockReturnValue(null);
        const mainG = createGraph({
            hasNode: (n) => n === 'test/note.md',
            inEdges: [
                {
                    source: 'folder/parent.md',
                    target: 'test/note.md',
                    attrs: { dir: 'down' },
                },
                {
                    source: 'folder/prev.md',
                    target: 'test/note.md',
                    attrs: { dir: 'next' },
                },
            ],
        });

        (mockApp.plugins.getPlugin as ReturnType<typeof vi.fn>).mockReturnValue({
            api: createMockApi({ getMatrixNeighbours, mainG }),
        });

        const result = await adapter.getHierarchy('note');

        expect(result).not.toBeNull();
        expect(result!.parents).toContain('folder/parent.md');
        expect(result!.prev).toContain('folder/prev.md');
    });

    it('returns empty hierarchy for isolated graph node', async () => {
        const getMatrixNeighbours = vi.fn().mockReturnValue(null);
        const closedG = createGraph({
            hasNode: (n) => n === 'test/note.md',
        });

        (mockApp.plugins.getPlugin as ReturnType<typeof vi.fn>).mockReturnValue({
            api: createMockApi({ getMatrixNeighbours, closedG }),
        });

        const result = await adapter.getHierarchy('note');

        expect(result).toEqual({
            parents: [],
            children: [],
            siblings: [],
            next: [],
            prev: [],
        });
    });

    it('normalizes nested neighbour shapes from matrix', async () => {
        const getMatrixNeighbours = vi.fn().mockReturnValue({
            up: [{ paths: ['parent'] }],
            down: [{ normalizedPaths: ['child'] }],
            same: [{ path: 'folder/peer.md' }],
            next: [{ normalizedPath: 'folder/next.md' }],
            prev: [{ node: 'folder/prev.md' }],
        });

        (mockApp.plugins.getPlugin as ReturnType<typeof vi.fn>).mockReturnValue({
            api: createMockApi({ getMatrixNeighbours }),
        });

        const result = await adapter.getHierarchy('note');

        expect(result).not.toBeNull();
        expect(result!.parents).toContain('folder/parent.md');
        expect(result!.children).toContain('folder/child.md');
        expect(result!.siblings).toContain('folder/peer.md');
        expect(result!.next).toContain('folder/next.md');
        expect(result!.prev).toContain('folder/prev.md');
    });

    it('dedupes and removes current node from flattened neighbours', async () => {
        const getMatrixNeighbours = vi.fn().mockReturnValue({
            up: ['note', 'parent', 'parent'],
            down: [],
            same: [],
            next: [],
            prev: [],
        });

        (mockApp.plugins.getPlugin as ReturnType<typeof vi.fn>).mockReturnValue({
            api: createMockApi({ getMatrixNeighbours }),
        });

        const result = await adapter.getHierarchy('note');

        expect(result).not.toBeNull();
        expect(result!.parents).toEqual(['folder/parent.md']);
    });

    it('returns null when no usable source exists', async () => {
        const getMatrixNeighbours = vi.fn().mockReturnValue(null);

        (mockApp.plugins.getPlugin as ReturnType<typeof vi.fn>).mockReturnValue({
            api: createMockApi({ getMatrixNeighbours }),
        });

        const result = await adapter.getHierarchy('note');
        expect(result).toBeNull();
    });

    it('uses window.BCAPI.get_neighbours for V4 fallback', async () => {
        const getMatrixNeighbours = vi.fn().mockReturnValue(null);
        (mockApp.plugins.getPlugin as ReturnType<typeof vi.fn>).mockReturnValue({
            api: createMockApi({ getMatrixNeighbours }),
        });

        // Set up global `window.BCAPI` mock
        (globalThis as any).window = globalThis as any;
        (globalThis as any).window.BCAPI = {
            get_neighbours: () => ({
                edges: [
                    { target: 'folder/parent.md', attrs: { dir: 'up' } },
                    { target: 'folder/next.md', attrs: { dir: 'next' } },
                ],
            }),
        };

        const result = await adapter.getHierarchy('test/note.md');

        expect(result).not.toBeNull();
        expect(result!.parents).toContain('folder/parent.md');
        expect(result!.next).toContain('folder/next.md');

        // Cleanup mock
        delete (globalThis as any).window.BCAPI;
    });

    it('ignores edges with invalid dir in V4', async () => {
        (mockApp.plugins.getPlugin as ReturnType<typeof vi.fn>).mockReturnValue({
            api: createMockApi(),
        });

        (globalThis as any).window = globalThis as any;
        (globalThis as any).window.BCAPI = {
            get_neighbours: () => ({
                edges: [
                    { target: 'folder/parent.md', dir: 'up' }, // valid → parents
                    { target: 'folder/child.md', dir: 'diagonal' }, // invalid → ignored
                    { target: 'folder/peer.md', attrs: { dir: '' } }, // empty → ignored
                    { target: 'folder/next.md', dir: 42 }, // non-string → ignored
                ],
            }),
        };

        const result = await adapter.getHierarchy('test/note.md');

        expect(result).not.toBeNull();
        expect(result!.parents).toEqual(['folder/parent.md']);
        expect(result!.children).toEqual([]);
        expect(result!.siblings).toEqual([]);

        delete (globalThis as any).window.BCAPI;
    });

    it('ignores bare string edges (no dir) in V4 — policy: fail-closed', async () => {
        // Policy decision: if BCAPI returns string edges (target only, no dir),
        // they get dir=undefined → ignored. Prevents false hierarchy from untyped edges.
        (mockApp.plugins.getPlugin as ReturnType<typeof vi.fn>).mockReturnValue({
            api: createMockApi(),
        });

        (globalThis as any).window = globalThis as any;
        (globalThis as any).window.BCAPI = {
            get_neighbours: () => ['folder/parent.md', 'folder/child.md'],
        };

        const result = await adapter.getHierarchy('test/note.md');

        expect(result).not.toBeNull();
        // String edges have no dir → all ignored (fail-closed policy)
        expect(result!.parents).toEqual([]);
        expect(result!.children).toEqual([]);
        expect(result!.siblings).toEqual([]);
        expect(result!.next).toEqual([]);
        expect(result!.prev).toEqual([]);

        delete (globalThis as any).window.BCAPI;
    });
});
