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
    TFile: class MockTFile {
        path: string;
        stat: { ctime: number; mtime: number };
        constructor(path = 'folder/note.md') {
            this.path = path;
            this.stat = { ctime: 123, mtime: 456 };
        }
    },
    parseLinktext: vi.fn((value: string) => ({ path: value, subpath: '' })),
}));

import { DatacoreAdapter } from '../../../src/core/adapters/DatacoreAdapter';
import { App } from 'obsidian';

describe('DatacoreAdapter Hardening', () => {
    let adapter: DatacoreAdapter;
    let mockApp: App;

    beforeEach(() => {
        mockApp = {
            metadataCache: { on: vi.fn(), offref: vi.fn() },
            vault: { on: vi.fn(), offref: vi.fn() },
            plugins: { getPlugin: vi.fn() },
        } as unknown as App;
        adapter = new DatacoreAdapter(mockApp);
    });

    afterEach(() => {
        adapter.destroy();
    });

    it('throws error when getLinks is called before initialize', async () => {
        await expect(adapter.getLinks()).rejects.toThrow('datacore adapter: not initialized');
    });

    it('throws error when getPage is called before initialize', () => {
        expect(() => adapter.getPage('test')).toThrow('datacore adapter: not initialized');
    });

    it('throws error when getPages is called before initialize', () => {
        expect(() => adapter.getPages('@page')).toThrow('datacore adapter: not initialized');
    });

    it('throws error when getBacklinks is called before initialize', () => {
        expect(() => adapter.getBacklinks('test')).toThrow('datacore adapter: not initialized');
    });

    it('succeeds after initialize', async () => {
        await adapter.initialize();
        // Should not throw, even if it returns empty
        await expect(adapter.getLinks()).resolves.toEqual([]);
        expect(adapter.getPage('test')).toBeNull();
    });
});
