import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheService } from '../../src/core/CacheService';
import { Plugin, normalizePath, TFile } from 'obsidian';

vi.mock('obsidian', () => ({
    normalizePath: vi.fn((p) => p),
    TFile: class {},
}));

interface MockAdapter {
    exists: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    rename: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
}

describe('CacheService', () => {
    let service: CacheService;
    let mockPlugin: unknown;
    let mockAdapter: MockAdapter;

    beforeEach(() => {
        mockAdapter = {
            exists: vi.fn(),
            read: vi.fn(),
            write: vi.fn(),
            rename: vi.fn(),
            remove: vi.fn(),
        };

        mockPlugin = {
            manifest: { id: 'test-plugin', dir: 'test-dir' },
            app: {
                vault: {
                    adapter: mockAdapter,
                },
            },
        };

        service = new CacheService(mockPlugin as Plugin);
        vi.clearAllMocks();
    });

    it('should load cache from disk', async () => {
        const mockCache = {
            pendingSuggestions: [{ id: '1', type: 'ai' }],
            history: [],
            topologicalScores: { pageRank: {} },
            vectorEmbeddings: { 'note.md': { vector: [0.1], hash: 'abc' } },
        };
        mockAdapter.exists.mockResolvedValue(true);
        mockAdapter.read.mockResolvedValue(JSON.stringify(mockCache));

        await service.load();

        expect(service.suggestions).toHaveLength(1);
        expect(service.getStoredEmbedding('note.md', 'abc')).toEqual([0.1]);
    });

    it('should return null if hash mismatch', async () => {
        const mockCache = {
            vectorEmbeddings: { 'note.md': { vector: [0.1], hash: 'abc' } },
        };
        mockAdapter.exists.mockResolvedValue(true);
        mockAdapter.read.mockResolvedValue(JSON.stringify(mockCache));

        await service.load();

        expect(service.getStoredEmbedding('note.md', 'wrong')).toBeNull();
    });

    it('should store embedding and trigger save', async () => {
        vi.useFakeTimers();
        mockAdapter.exists.mockResolvedValue(false);
        await service.load();

        service.storeEmbedding('new.md', [0.2], 'def');

        expect(service.getStoredEmbedding('new.md', 'def')).toEqual([0.2]);

        // Fast-forward debounce
        vi.runAllTimers();
        // Allow promise chain to resolve
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(mockAdapter.write).toHaveBeenCalledWith(
            expect.stringContaining('healer-cache.json.tmp'),
            expect.stringContaining('"vector": [\n        0.2\n      ]'),
        );
        vi.useRealTimers();
    });

    it('should handle corrupted JSON gracefully and start fresh', async () => {
        mockAdapter.exists.mockResolvedValue(true);
        mockAdapter.read.mockResolvedValue('invalid json');
        mockAdapter.rename.mockResolvedValue(undefined);

        // It doesn't throw because the outer catch swallows it after renaming
        await service.load();

        expect(mockAdapter.rename).toHaveBeenCalledWith(
            expect.stringContaining('healer-cache.json'),
            expect.stringContaining('healer-cache.json.corrupt'),
        );
        expect(service.suggestions).toHaveLength(0); // Started fresh
    });
});
