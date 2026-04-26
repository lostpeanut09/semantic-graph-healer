// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/core/HealerUtils', async () => {
    const actual = await vi.importActual('../../../src/core/HealerUtils');
    return {
        ...actual,
        HealerLogger: {
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        },
        isObsidianInternalApp: vi.fn(() => true),
    };
});

vi.mock('obsidian', () => ({
    App: class MockApp {},
    EventRef: class MockEventRef {},
    TAbstractFile: class MockTAbstractFile {},
    TFile: class MockTFile {
        path: string;
        stat: { ctime: number; mtime: number };

        constructor(path = 'folder/note.md') {
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

import { DatacoreAdapter } from '../../../src/core/adapters/DatacoreAdapter';
import { TFile, type App, parseLinktext } from 'obsidian';

type ListenerMap = Record<string, Function[]>;

function createListenerHub() {
    const listeners: ListenerMap = {};

    return {
        listeners,
        on: vi.fn((name: string, cb: Function) => {
            listeners[name] ??= [];
            listeners[name].push(cb);
            return { name, cb };
        }),
        emit(name: string, ...args: unknown[]) {
            for (const cb of listeners[name] ?? []) cb(...args);
        },
    };
}

const makeTFile = (path: string): TFile => new (TFile as any)(path) as TFile;

function makeMarkdownPage(overrides: Record<string, unknown> = {}) {
    const base = {
        $types: ['page', 'markdown'],
        $path: 'folder/note.md',
        $name: 'note',
        $extension: 'md',
        $size: 123,
        $tags: [] as string[],
        $links: [] as unknown[],
        $frontmatter: {} as Record<string, unknown>,
        $infields: {} as Record<string, unknown>,
        $sections: [] as unknown[],
        $ctime: new Date('2026-01-01T10:00:00Z'),
        $mtime: new Date('2026-01-02T10:00:00Z'),
        $link: { path: 'folder/note.md', type: 'file' },
        value: vi.fn((_key: string) => undefined),
    };

    return { ...base, ...overrides };
}

function makeTaskNode(overrides: Record<string, unknown> = {}) {
    const base = {
        $types: ['task'],
        $file: 'folder/note.md',
        $line: 1,
        $lineCount: 1,
        $links: [] as unknown[],
        $tags: [] as unknown[],
        $text: 'task',
        $blockId: undefined,
        $parentLine: undefined,
        $status: ' ',
        $completed: false,
        $infields: {} as Record<string, unknown>,
        value: vi.fn((_key: string) => undefined),
    };

    return { ...base, ...overrides };
}

describe('DatacoreAdapter', () => {
    let adapter: DatacoreAdapter;
    let mockApp: App;

    let metadataHub: ReturnType<typeof createListenerHub>;
    let vaultHub: ReturnType<typeof createListenerHub>;

    let dcApi: {
        tryQuery: ReturnType<typeof vi.fn>;
        query: ReturnType<typeof vi.fn>;
        resolvePath: ReturnType<typeof vi.fn>;
        page: ReturnType<typeof vi.fn>;
        blockLink: ReturnType<typeof vi.fn>;
        coerce: { date: ReturnType<typeof vi.fn> };
    };

    let dvApi: {
        date: ReturnType<typeof vi.fn>;
    };

    let metadataCache: Record<string, unknown>;
    let vault: Record<string, unknown>;
    let getPlugin: ReturnType<typeof vi.fn>;
    let getEnabledPluginById: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();

        metadataHub = createListenerHub();
        vaultHub = createListenerHub();

        dcApi = {
            tryQuery: vi.fn(),
            query: vi.fn(),
            resolvePath: vi.fn((p: string) => p),
            page: vi.fn(),
            blockLink: vi.fn((path: string, blockId: string) => ({
                path: `${path}#^${blockId}`,
                type: 'block',
            })),
            coerce: {
                date: vi.fn((value: string) => {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
                    return new Date(value);
                }),
            },
        };

        dvApi = {
            date: vi.fn((value: string) => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
                return new Date(value);
            }),
        };

        metadataCache = {
            on: metadataHub.on,
            offref: vi.fn(),
            getFirstLinkpathDest: vi.fn((p: string) => {
                if (p === 'note') return makeTFile('folder/note.md');
                if (p === 'other') return makeTFile('folder/other.md');
                return null;
            }),
            resolvedLinks: {},
        };

        vault = {
            on: vaultHub.on,
            offref: vi.fn(),
            getAbstractFileByPath: vi.fn((p: string) => {
                if (p === 'folder/note.md') return makeTFile('folder/note.md');
                if (p === 'folder/other.md') return makeTFile('folder/other.md');
                return null;
            }),
        };

        getPlugin = vi.fn((id: string) => {
            if (id === 'datacore') return { api: dcApi };
            if (id === 'dataview') return { api: dvApi };
            return null;
        });

        getEnabledPluginById = vi.fn(() => null);

        mockApp = {
            metadataCache,
            vault,
            plugins: {
                getPlugin,
            },
            internalPlugins: {
                getEnabledPluginById,
            },
        } as unknown as App;

        adapter = new DatacoreAdapter(mockApp);
    });

    afterEach(() => {
        adapter.destroy();
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it('registers resolve/resolved/deleted listeners and vault rename listener', () => {
        expect(metadataHub.on).toHaveBeenCalledWith('resolve', expect.any(Function));
        expect(metadataHub.on).toHaveBeenCalledWith('resolved', expect.any(Function));
        expect(metadataHub.on).toHaveBeenCalledWith('deleted', expect.any(Function));
        expect(vaultHub.on).toHaveBeenCalledWith('rename', expect.any(Function));
    });

    it('getPage strips subpath and uses resolvedPath in fallback query', () => {
        const page = makeMarkdownPage({
            $path: 'folder/note.md',
            $name: 'note',
        });

        dcApi.resolvePath.mockReturnValue('folder/note.md');
        dcApi.page.mockReturnValue(null);
        dcApi.tryQuery.mockReturnValue({
            successful: true,
            value: [page],
        });

        const result = adapter.getPage('note#Heading');

        expect(parseLinktext).toHaveBeenCalledWith('note#Heading');
        expect(dcApi.resolvePath).toHaveBeenCalledWith('note');
        expect(dcApi.tryQuery).toHaveBeenCalledWith('@page and $path = "folder/note.md"');
        expect(result?.file.path).toBe('folder/note.md');
    });

    it('getBacklinks normalizes short/subpath input against resolvedLinks absolute paths', () => {
        (metadataCache.resolvedLinks as Record<string, Record<string, number>>) = {
            'src.md': { 'folder/note.md': 2 },
            'elsewhere.md': { 'folder/other.md': 1 },
        };

        const result = adapter.getBacklinks('note#Section');

        expect(parseLinktext).toHaveBeenCalledWith('note#Section');
        expect(metadataCache.getFirstLinkpathDest as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('note', '');
        expect(result).toEqual(['src.md']);
    });

    it('does not cache partial failures in getPageChildren', () => {
        dcApi.tryQuery.mockImplementation((query: string) => {
            if (query.startsWith('@task and childof')) {
                return { successful: false, error: 'temporary task failure' };
            }
            if (query.startsWith('@list-item and childof')) {
                return {
                    successful: true,
                    value: [makeTaskNode({ $types: ['list-item'], $line: 10 })],
                };
            }
            return { successful: false, error: 'unexpected query' };
        });

        const first = (adapter as any).getPageChildren('folder/note.md');
        expect(first.tasks).toEqual([]);
        expect(first.lists).toHaveLength(1);

        dcApi.tryQuery.mockImplementation((query: string) => {
            if (query.startsWith('@task and childof')) {
                return {
                    successful: true,
                    value: [makeTaskNode({ $line: 10 })],
                };
            }
            if (query.startsWith('@list-item and childof')) {
                return {
                    successful: true,
                    value: [makeTaskNode({ $types: ['list-item'], $line: 10 })],
                };
            }
            return { successful: false, error: 'unexpected query' };
        });

        const second = (adapter as any).getPageChildren('folder/note.md');
        expect(second.tasks).toHaveLength(1);
        expect(second.lists).toHaveLength(1);

        // 2 query call per invocation => no cache after partial failure
        expect(dcApi.tryQuery).toHaveBeenCalledTimes(4);
    });

    it('does not cache failed prefetch batches, but caches successful ones', () => {
        dcApi.tryQuery.mockImplementation((query: string) => {
            if (query.startsWith('@task and ')) {
                return {
                    successful: true,
                    value: [makeTaskNode({ $file: 'folder/note.md' })],
                };
            }
            if (query.startsWith('@list-item and ')) {
                return { successful: false, error: 'temporary list failure' };
            }
            return { successful: false, error: 'unexpected query' };
        });

        (adapter as any).prefetchChildrenForPaths(['folder/note.md']);
        expect((adapter as any).pageChildrenCache.has('folder/note.md')).toBe(false);

        dcApi.tryQuery.mockImplementation((query: string) => {
            if (query.startsWith('@task and ')) {
                return {
                    successful: true,
                    value: [makeTaskNode({ $file: 'folder/note.md' })],
                };
            }
            if (query.startsWith('@list-item and ')) {
                return {
                    successful: true,
                    value: [makeTaskNode({ $types: ['list-item'], $file: 'folder/note.md' })],
                };
            }
            return { successful: false, error: 'unexpected query' };
        });

        (adapter as any).prefetchChildrenForPaths(['folder/note.md']);
        expect((adapter as any).pageChildrenCache.has('folder/note.md')).toBe(true);
    });

    it('maps file.frontmatter, file.aliases and file.starred correctly', () => {
        const page = makeMarkdownPage({
            $path: 'folder/note.md',
            $name: 'note',
            $frontmatter: {
                rating: { key: 'rating', raw: '5' },
                aliases: { value: ['Alias A'] },
                simple: 'x',
            },
            value: vi.fn((key: string) => {
                if (key === 'aliases') return ['Alias A'];
                if (key === 'rating') return 5;
                return undefined;
            }),
        });

        getEnabledPluginById.mockImplementation((id: string) => {
            if (id === 'bookmarks') {
                return {
                    instance: {
                        items: [{ type: 'file', path: 'folder/note.md' }],
                    },
                };
            }
            return null;
        });

        dcApi.page.mockReturnValue(page);
        dcApi.resolvePath.mockReturnValue('folder/note.md');
        dcApi.tryQuery.mockImplementation((query: string) => {
            if (query.startsWith('@task and childof')) return { successful: true, value: [] };
            if (query.startsWith('@list-item and childof')) return { successful: true, value: [] };
            return { successful: false, error: 'unexpected query' };
        });

        const result = adapter.getPage('folder/note.md') as any;

        expect(result.file.frontmatter).toContain('rating | 5');
        expect(result.file.frontmatter).toContain('simple | x');
        expect(result.file.aliases).toEqual(['Alias A']);
        expect(result.file.starred).toBe(true);
    });

    it('maps tasks/lists and computes fullyCompleted from children', () => {
        const page = makeMarkdownPage({
            $path: 'folder/note.md',
            $name: '20260102 Note',
        });

        const rootTask = makeTaskNode({
            $line: 1,
            $text: 'root',
            $status: 'x',
            $completed: true,
        });

        const childTask = makeTaskNode({
            $line: 2,
            $parentLine: 1,
            $text: 'child',
            $status: ' ',
            $completed: false,
        });

        const plainList = makeTaskNode({
            $types: ['list-item'],
            $line: 3,
            $text: 'plain bullet',
            $status: undefined,
            $completed: undefined,
        });

        dcApi.page.mockReturnValue(page);
        dcApi.resolvePath.mockReturnValue('folder/note.md');
        dcApi.tryQuery.mockImplementation((query: string) => {
            if (query.startsWith('@task and childof')) {
                return { successful: true, value: [rootTask, childTask] };
            }
            if (query.startsWith('@list-item and childof')) {
                return { successful: true, value: [rootTask, childTask, plainList] };
            }
            return { successful: false, error: 'unexpected query' };
        });

        const result = adapter.getPage('folder/note.md') as any;

        expect(result.file.tasks).toHaveLength(2);
        expect(result.file.lists).toHaveLength(3);

        const root = result.file.tasks.find((t: any) => t.line === 1);
        const child = result.file.tasks.find((t: any) => t.line === 2);
        const list = result.file.lists.find((t: any) => t.line === 3);

        expect(root.completed).toBe(true);
        expect(root.fullyCompleted).toBe(false);
        expect(child.parent).toBe(1);

        // Lock in checkbox semantics: unchecked task [ ] still has checkbox present.
        expect(root.checked).toBe(true); // [x] → checked
        expect(child.checked).toBe(true); // [ ] (status=' ') → checked=true (checkbox present)
        expect(list.checked).toBe(false); // plain list-item, no status → no checkbox

        expect(list.task).toBe(false);
        expect(result.file.day).toBeDefined();
    });

    it('debounces invalidation on metadata and vault events', () => {
        (adapter as any).backlinkIndex = new Map([['folder/note.md', new Set(['src.md'])]]);
        (adapter as any).linkCache.set('folder/note.md', {
            path: 'folder/note.md',
        });
        (adapter as any).pageChildrenCache.set('folder/note.md', {
            tasks: [],
            lists: [],
        });

        metadataHub.emit('resolve', makeTFile('folder/note.md'));

        expect((adapter as any).backlinkIndex).not.toBeNull();
        vi.advanceTimersByTime(249);
        expect((adapter as any).backlinkIndex).not.toBeNull();

        vi.advanceTimersByTime(1);
        expect((adapter as any).backlinkIndex).toBeNull();
        expect((adapter as any).linkCache.size).toBe(0);
        expect((adapter as any).pageChildrenCache.size).toBe(0);

        (adapter as any).backlinkIndex = new Map([['folder/note.md', new Set(['src.md'])]]);
        vaultHub.emit('rename', makeTFile('folder/note.md'), 'old/path.md');
        vi.advanceTimersByTime(250);
        expect((adapter as any).backlinkIndex).toBeNull();
    });

    it('destroy unregisters listeners and clears caches', () => {
        (adapter as any).backlinkIndex = new Map([['folder/note.md', new Set(['src.md'])]]);
        (adapter as any).linkCache.set('folder/note.md', {
            path: 'folder/note.md',
        });
        (adapter as any).pageChildrenCache.set('folder/note.md', {
            tasks: [],
            lists: [],
        });

        adapter.destroy();

        expect(metadataCache.offref).toHaveBeenCalledTimes(4);
        expect(vault.offref).toHaveBeenCalledTimes(2);
        expect((adapter as any).backlinkIndex).toBeNull();
        expect((adapter as any).linkCache.size).toBe(0);
        expect((adapter as any).pageChildrenCache.size).toBe(0);
    });

    it('falls back to query() when tryQuery is unavailable', () => {
        const page = makeMarkdownPage({
            $path: 'folder/note.md',
            $name: 'note',
        });

        // Replace dcApi with one that only has query(), no tryQuery
        const queryOnlyApi = {
            query: vi.fn((q: string) => {
                if (q.includes('@page')) return [page];
                if (q.startsWith('@task')) return [];
                if (q.startsWith('@list-item')) return [];
                return [];
            }),
            resolvePath: vi.fn((p: string) => p),
            page: vi.fn(() => null),
            coerce: dcApi.coerce,
        };

        getPlugin.mockImplementation((id: string) => {
            if (id === 'datacore') return { api: queryOnlyApi };
            if (id === 'dataview') return { api: dvApi };
            return null;
        });

        const result = adapter.getPage('folder/note.md');

        expect(result).not.toBeNull();
        expect(result!.file.path).toBe('folder/note.md');
        expect(queryOnlyApi.query).toHaveBeenCalled();
    });

    describe('BoundedMap eviction', () => {
        it('does not exceed max size and evicts oldest entry (FIFO)', () => {
            const BoundedMap = (adapter as any).pageChildrenCache.constructor;
            const map = new BoundedMap(3);

            map.set('a', { tasks: [], lists: [] });
            map.set('b', { tasks: [], lists: [] });
            map.set('c', { tasks: [], lists: [] });
            expect(map.size).toBe(3);

            map.set('d', { tasks: [], lists: [] });
            expect(map.size).toBe(3);
            expect(map.has('a')).toBe(false); // oldest evicted
            expect(map.has('d')).toBe(true);
        });

        it('evicts least recently used after access pattern (touch-on-get)', () => {
            const BoundedMap = (adapter as any).pageChildrenCache.constructor;
            const map = new BoundedMap(3);

            // Insert a, b, c
            map.set('a', 1);
            map.set('b', 2);
            map.set('c', 3);
            // Access a to make it recently used
            expect(map.get('a')).toBe(1);
            // Insert d — should evict b (least recently accessed), not a nor c
            map.set('d', 4);

            expect(map.has('a')).toBe(true); // touched → still present
            expect(map.has('b')).toBe(false); // LRU → evicted
            expect(map.has('c')).toBe(true); // not accessed but inserted after b
            expect(map.has('d')).toBe(true);
        });

        it('does not evict on update of existing key', () => {
            const BoundedMap = (adapter as any).pageChildrenCache.constructor;
            const map = new BoundedMap(2);

            map.set('a', { tasks: [1], lists: [] });
            map.set('b', { tasks: [2], lists: [] });
            map.set('a', { tasks: [3], lists: [] }); // update

            expect(map.size).toBe(2);
            expect(map.get('a')).toEqual({ tasks: [3], lists: [] });
            expect(map.get('b')).toEqual({ tasks: [2], lists: [] });
        });
    });
});
