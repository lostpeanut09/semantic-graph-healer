import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NativeVaultAdapter } from '../../../src/core/adapters/NativeVaultAdapter';
import { App, TFile } from 'obsidian';

describe('NativeVaultAdapter', () => {
    let app: App;
    let adapter: NativeVaultAdapter;

    beforeEach(() => {
        app = {
            metadataCache: {
                resolvedLinks: {},
                getFirstLinkpathDest: vi.fn((link) => ({ path: link })),
            },
            vault: {
                getAbstractFileByPath: vi.fn(),
            },
        } as unknown as App;
        adapter = new NativeVaultAdapter(app);
    });

    it('should throw if getLinks is called before initialization', async () => {
        await expect(adapter.getLinks()).rejects.toThrow('native-vault adapter: not initialized');
    });

    it('should throw if getRichLinksForFile is called before initialization', async () => {
        const mockFile = { path: 'test.md' } as unknown as TFile;
        await expect(adapter.getRichLinksForFile(mockFile)).rejects.toThrow('native-vault adapter: not initialized');
    });

    it('should work after initialization', async () => {
        await adapter.initialize();
        const links = await adapter.getLinks();
        expect(Array.isArray(links)).toBe(true);
    });

    it('should normalize paths, filter self-links and non-markdown if configured', async () => {
        // Mock app.settings
        (app as unknown as { settings: { includeNonMarkdownHubs: boolean } }).settings = {
            includeNonMarkdownHubs: false,
        };

        const debugAdapter = new NativeVaultAdapter(app, true);

        // Mock metadataCache.resolvedLinks
        (
            app.metadataCache as unknown as {
                resolvedLinks: Record<string, Record<string, number>>;
            }
        ).resolvedLinks = {
            'source.md': {
                'target.md': 1,
                'source.md': 1, // Self-link
                'image.png': 1, // Non-markdown
            },
        };

        await debugAdapter.initialize();
        const links = await debugAdapter.getLinks();

        expect(links).toHaveLength(1);
        expect(links[0].sourcePath).toBe('source.md');
        expect(links[0].targetPath).toBe('target.md');
    });
});
