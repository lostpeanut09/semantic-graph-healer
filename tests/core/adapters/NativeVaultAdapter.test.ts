import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NativeVaultAdapter } from '../../../src/core/adapters/NativeVaultAdapter';
import { App } from 'obsidian';

describe('NativeVaultAdapter', () => {
    let app: App;
    let adapter: NativeVaultAdapter;

    beforeEach(() => {
        app = {
            metadataCache: {
                resolvedLinks: {},
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
        const mockFile = { path: 'test.md' } as any;
        await expect(adapter.getRichLinksForFile(mockFile)).rejects.toThrow('native-vault adapter: not initialized');
    });

    it('should work after initialization', async () => {
        await adapter.initialize();
        const links = await adapter.getLinks();
        expect(Array.isArray(links)).toBe(true);
    });
});
