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
        basename: string;
        stat: { ctime: number; mtime: number };

        constructor(path = 'folder/note.md', mtime = 1000) {
            this.path = path;
            this.basename = path.split('/').pop()?.replace(/\.md$/, '') ?? path;
            this.stat = { ctime: 0, mtime };
        }
    },
    parseLinktext: vi.fn((value: string) => {
        const idx = value.indexOf('#');
        if (idx === -1) return { path: value, subpath: '' };
        return { path: value.slice(0, idx), subpath: value.slice(idx) };
    }),
}));

import { SmartConnectionsAdapter } from '../../../src/core/adapters/SmartConnectionsAdapter';
import { TFile, type App } from 'obsidian';

const makeTFile = (path: string, mtime = 1000): TFile => new (TFile as any)(path, mtime) as TFile;

describe('SmartConnectionsAdapter', () => {
    let adapter: SmartConnectionsAdapter;
    let mockApp: App;
    let cachedRead: ReturnType<typeof vi.fn>;
    let getAbstractFileByPath: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        cachedRead = vi.fn().mockResolvedValue('# Note\nsome content here for the query');
        getAbstractFileByPath = vi.fn((p: string) => {
            if (p === 'folder/note.md') return makeTFile('folder/note.md', 1000);
            return null;
        });

        mockApp = {
            vault: {
                adapter: {
                    exists: vi.fn().mockResolvedValue(false),
                    list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
                    read: vi.fn().mockResolvedValue('{}'),
                },
                getAbstractFileByPath,
                cachedRead,
            },
            metadataCache: {
                getFirstLinkpathDest: vi.fn((p: string) => {
                    if (p === 'folder/note.md') return makeTFile('folder/note.md', 1000);
                    return null;
                }),
                fileToLinktext: vi.fn((f: TFile) => f.path),
            },
            plugins: {
                getPlugin: vi.fn(() => null),
            },
        } as unknown as App;

        adapter = new SmartConnectionsAdapter(mockApp);
    });

    afterEach(() => {
        adapter.destroy();
        vi.clearAllMocks();
    });

    describe('semanticQueryCache', () => {
        it('cache miss on first call: reads file', async () => {
            // Trigger buildSemanticQuery indirectly via getRelatedNotes
            // (No SC plugin → falls through to AJSON fallback which also hits adapter.list → empty)
            // We access buildSemanticQuery directly since it's private.
            const query = await (adapter as any).buildSemanticQuery('folder/note.md');

            expect(cachedRead).toHaveBeenCalledTimes(1);
            expect(query).toContain('note');
        });

        it('cache hit on second call with same mtime: no re-read', async () => {
            await (adapter as any).buildSemanticQuery('folder/note.md');
            await (adapter as any).buildSemanticQuery('folder/note.md');

            expect(cachedRead).toHaveBeenCalledTimes(1); // only first call reads
        });

        it('cache miss after mtime change: re-reads file', async () => {
            await (adapter as any).buildSemanticQuery('folder/note.md');

            // Simulate file modification: update mtime
            getAbstractFileByPath.mockImplementation((p: string) => {
                if (p === 'folder/note.md') return makeTFile('folder/note.md', 9999);
                return null;
            });

            await (adapter as any).buildSemanticQuery('folder/note.md');

            expect(cachedRead).toHaveBeenCalledTimes(2); // re-read after mtime change
        });

        it('invalidate(path) removes specific cache entry', async () => {
            await (adapter as any).buildSemanticQuery('folder/note.md');
            expect(cachedRead).toHaveBeenCalledTimes(1);

            adapter.invalidate('folder/note.md');

            await (adapter as any).buildSemanticQuery('folder/note.md');
            expect(cachedRead).toHaveBeenCalledTimes(2); // re-read after explicit invalidate
        });

        it('invalidate() with no path clears all entries', async () => {
            await (adapter as any).buildSemanticQuery('folder/note.md');
            expect(cachedRead).toHaveBeenCalledTimes(1);

            adapter.invalidate(); // global clear

            await (adapter as any).buildSemanticQuery('folder/note.md');
            expect(cachedRead).toHaveBeenCalledTimes(2);
        });

        it('destroy() clears cache', async () => {
            await (adapter as any).buildSemanticQuery('folder/note.md');

            adapter.destroy();

            // Internal cache should be empty after destroy
            const cacheSize = (adapter as any).semanticQueryCache.size;
            expect(cacheSize).toBe(0);
        });

        it('returns path when file not found in vault', async () => {
            const result = await (adapter as any).buildSemanticQuery('nonexistent/file.md');
            expect(cachedRead).not.toHaveBeenCalled();
            expect(result).toBe('nonexistent/file.md');
        });
    });
});
