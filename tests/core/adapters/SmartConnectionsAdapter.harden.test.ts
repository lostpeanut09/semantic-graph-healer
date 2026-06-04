// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { SmartConnectionsAdapter } from '../../../src/core/adapters/SmartConnectionsAdapter';
import { TFile, type App } from 'obsidian';
import { HealerLogger } from '../../../src/core/utils/HealerLogger';

vi.mock('../../../src/core/HealerUtils', async () => {
    const actual = await vi.importActual('../../../src/core/HealerUtils');
    return {
        ...actual,
        isObsidianInternalApp: vi.fn(() => true),
    };
});

vi.mock('../../../src/core/utils/HealerLogger', async () => {
    const actual = await vi.importActual('../../../src/core/utils/HealerLogger');
    return {
        ...actual,
        HealerLogger: {
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            info: vi.fn(),
            setInstance: vi.fn(),
        },
    };
});

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

const makeTFile = (path: string, mtime = 1000): TFile => new (TFile as any)(path, mtime) as TFile;

describe('SmartConnectionsAdapter Hardening', () => {
    let adapter: SmartConnectionsAdapter;
    let mockApp: App;

    beforeEach(() => {
        mockApp = {
            vault: {
                adapter: {
                    exists: vi.fn().mockResolvedValue(false),
                    list: vi.fn().mockResolvedValue({ files: [], folders: [] }),
                    read: vi.fn().mockResolvedValue('{}'),
                    stat: vi.fn().mockResolvedValue({ size: 100 }),
                },
                getAbstractFileByPath: vi.fn((p: string) => {
                    if (p === 'folder/note.md') return makeTFile('folder/note.md', 1000);
                    return null;
                }),
                cachedRead: vi.fn().mockResolvedValue('# Note content'),
            },
            metadataCache: {
                getFirstLinkpathDest: vi.fn((p: string) => {
                    if (p.includes('target')) return makeTFile(p, 1000);
                    return null;
                }),
            },
            plugins: {
                getPlugin: vi.fn(() => null),
            },
            // @ts-ignore
            settings: {
                smartConnectionsAjsonSizeCap: 1024, // 1KB for testing
            },
        } as unknown as App;

        adapter = new SmartConnectionsAdapter(mockApp, true);
    });

    afterEach(() => {
        adapter.destroy();
        vi.clearAllMocks();
    });

    it('honors smartConnectionsAjsonSizeCap from settings', async () => {
        const mockVault = mockApp.vault as any;
        mockVault.adapter.exists = vi.fn().mockResolvedValue(true);
        mockVault.adapter.stat = vi.fn().mockResolvedValue({ size: 2048 }); // 2KB > 1KB cap

        const result = await (adapter as any).queryAjsonFallback('folder/note.md', 5);

        expect(mockVault.adapter.read).not.toHaveBeenCalled();
        expect(HealerLogger.warn).toHaveBeenCalledWith(expect.stringContaining('skipping oversized'));
        expect(result).toEqual([]);
    });

    it('implements early break in queryAjsonFallback when limit is reached', async () => {
        const mockVault = mockApp.vault as any;
        mockVault.adapter.exists = vi.fn().mockResolvedValue(true);
        mockVault.adapter.stat = vi.fn().mockResolvedValue({ size: 500 }); // within cap

        const largeData = {
            items: {
                'target1.md': { refs: ['folder/note.md'] },
                'target2.md': { refs: ['folder/note.md'] },
                'target3.md': { refs: ['folder/note.md'] },
                'target4.md': { refs: ['folder/note.md'] },
            },
        };
        mockVault.adapter.read = vi.fn().mockResolvedValue(JSON.stringify(largeData));

        // Limit = 2
        const result = await (adapter as any).queryAjsonFallback('folder/note.md', 2);

        expect(result.length).toBe(2);
        // We can't easily verify the "early break" of the loop itself without mocking the loop,
        // but we can verify it doesn't return more than requested.
    });

    it('enforces 5000 max entries limit in queryAjsonFallback', async () => {
        const mockVault = mockApp.vault as any;
        mockVault.adapter.exists = vi.fn().mockResolvedValue(true);
        mockVault.adapter.stat = vi.fn().mockResolvedValue({ size: 100 * 1024 }); // 100KB

        // Temporarily increase cap for this test
        (mockApp as any).settings.smartConnectionsAjsonSizeCap = 200 * 1024;

        // Generate 5005 entries
        const items: Record<string, any> = {};
        for (let i = 0; i < 5005; i++) {
            items[`target${i}.md`] = { refs: ['folder/note.md'] };
        }
        mockVault.adapter.read = vi.fn().mockResolvedValue(JSON.stringify({ items }));

        // We use a high limit to ensure we hit the scanned limit first
        await (adapter as any).queryAjsonFallback('folder/note.md', 6000);

        expect(HealerLogger.warn).toHaveBeenCalledWith(expect.stringContaining('hit max scan limit (5000)'));
    });
});
