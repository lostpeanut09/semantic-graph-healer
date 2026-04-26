import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock HealerUtils BEFORE UnifiedMetadataAdapter import
vi.mock('../../../src/core/HealerUtils', () => ({
    HealerLogger: {
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
    isObsidianInternalApp: vi.fn(() => true),
}));

// Mock sub-adapters
vi.mock('../../../src/core/adapters/DatacoreAdapter', () => {
    return {
        DatacoreAdapter: class {
            getPage = vi.fn();
            queryPages = vi.fn();
            getPages = vi.fn();
            getBacklinks = vi.fn();
            getDataviewApi = vi.fn();
            invalidate = vi.fn();
            destroy = vi.fn();
            invalidateBacklinkIndex = vi.fn();
        },
    };
});

vi.mock('../../../src/core/adapters/BreadcrumbsAdapter', () => {
    return {
        BreadcrumbsAdapter: class {
            getHierarchy = vi.fn();
            invalidate = vi.fn();
            destroy = vi.fn();
        },
    };
});

vi.mock('../../../src/core/adapters/SmartConnectionsAdapter', () => {
    return {
        SmartConnectionsAdapter: class {
            getRelatedNotes = vi.fn();
            invalidate = vi.fn();
            destroy = vi.fn();
        },
    };
});

// Mock Obsidian
vi.mock('obsidian', () => ({
    App: vi.fn(),
    TFile: vi.fn(),
    parseLinktext: (t: string) => ({ path: t }),
    TFolder: vi.fn(),
    normalizePath: (p: string) => p,
}));

// Import AFTER all mocks
import { UnifiedMetadataAdapter } from '../../../src/core/adapters/UnifiedMetadataAdapter';
import { HealerLogger } from '../../../src/core/HealerUtils';

describe('UnifiedMetadataAdapter Hardening', () => {
    let adapter: UnifiedMetadataAdapter;
    let mockApp: any;
    let mockSettings: any;

    beforeEach(() => {
        mockApp = {
            vault: {
                getAbstractFileByPath: vi.fn().mockImplementation((p) => ({ path: p })),
                on: vi.fn(() => ({})), // return event ref for offref
                off: vi.fn(),
                offref: vi.fn(), // for StructuralCache.destroy
            },
            metadataCache: {
                on: vi.fn(() => ({})), // return event ref for offref
                off: vi.fn(),
                offref: vi.fn(), // for StructuralCache.destroy
                getFirstLinkpathDest: vi.fn(),
            },
        };

        mockSettings = {
            logLevel: 'info',
        };

        adapter = new UnifiedMetadataAdapter(
            mockApp,
            mockSettings,
            {},
            {
                ttlMs: 10000,
            },
        );
    });

    it('should return cached page on repeated calls', () => {
        const datacore = (adapter as any).datacore;
        const mockPage = { file: { path: 'test.md' } };
        datacore.getPage.mockReturnValue(mockPage);

        const res1 = adapter.getPage('test.md');
        const res2 = adapter.getPage('test.md');

        expect(res1).toBe(mockPage);
        expect(res2).toBe(mockPage);
        expect(datacore.getPage).toHaveBeenCalledTimes(1);
    });

    it('should not cache null — second call after data becomes available should hit adapter again', () => {
        const datacore = (adapter as any).datacore;
        const mockPage = { file: { path: 'test.md' } };

        // First call returns null (simulating transient miss)
        datacore.getPage.mockReturnValueOnce(null);
        let res1 = adapter.getPage('test.md');
        expect(res1).toBeNull();
        expect(datacore.getPage).toHaveBeenCalledTimes(1);

        // Second call — adapter now returns a page
        datacore.getPage.mockReturnValueOnce(mockPage);
        let res2 = adapter.getPage('test.md');
        expect(res2).toBe(mockPage);
        // Should have called adapter twice because null was not cached
        expect(datacore.getPage).toHaveBeenCalledTimes(2);
    });

    it('should be resilient to sub-adapter failures (safeExecute)', () => {
        const datacore = (adapter as any).datacore;
        datacore.getBacklinks.mockImplementation(() => {
            throw new Error('Datacore Crash');
        });

        // Should not throw, should return fallback []
        const res = adapter.getBacklinks('test.md');
        expect(res).toEqual([]);
    });

    it('should cache related notes (Smart Connections) with short TTL', async () => {
        const sc = (adapter as any).smartConnections;
        const mockNotes = [{ path: 'related.md', score: 0.9 }];
        sc.getRelatedNotes.mockResolvedValue(mockNotes);

        const res1 = await adapter.getRelatedNotes('test.md', 5);
        const res2 = await adapter.getRelatedNotes('test.md', 5);

        expect(res1).toEqual(mockNotes);
        expect(res2).toEqual(mockNotes);
        expect(sc.getRelatedNotes).toHaveBeenCalledTimes(1);
    });

    it('should invalidate all caches correctly', () => {
        const datacore = (adapter as any).datacore;
        const bc = (adapter as any).breadcrumbs;
        const sc = (adapter as any).smartConnections;

        datacore.getPage.mockReturnValue({ file: { path: 'test.md' } });
        adapter.getPage('test.md');

        adapter.invalidate('test.md');

        adapter.getPage('test.md');
        expect(datacore.getPage).toHaveBeenCalledTimes(2);
        expect(bc.invalidate).toHaveBeenCalledWith('test.md');
        expect(sc.invalidate).toHaveBeenCalledWith('test.md');
    });

    it('should handle async failures in hierarchy (safeExecuteAsync)', async () => {
        const bc = (adapter as any).breadcrumbs;
        bc.getHierarchy.mockRejectedValue(new Error('BC Failed'));

        const res = await adapter.getHierarchy('test.md');
        expect(res).toBeNull();
    });

    it('should destroy all sub-adapters even if one throws', () => {
        const datacore = (adapter as any).datacore;
        const breadcrumbs = (adapter as any).breadcrumbs;
        const smartConnections = (adapter as any).smartConnections;

        datacore.destroy.mockImplementation(() => {
            throw new Error('Datacore destroy crash');
        });

        // Should not throw, and other adapters must still be destroyed
        expect(() => adapter.destroy()).not.toThrow();
        expect(datacore.destroy).toHaveBeenCalled();
        expect(breadcrumbs.destroy).toHaveBeenCalled();
        expect(smartConnections.destroy).toHaveBeenCalled();
    });

    it('should log errors when sub-adapter destroy throws', () => {
        const datacore = (adapter as any).datacore;
        datacore.destroy.mockImplementation(() => {
            throw new Error('Datacore destroy crash');
        });

        adapter.destroy();

        expect(HealerLogger.error).toHaveBeenCalledWith(
            expect.stringContaining('datacore.destroy() failed'),
            expect.any(Error),
        );
    });

    it('should continue destroying caches even if one throws', () => {
        const pageCache = (adapter as any).pageCache;
        const hierarchyCache = (adapter as any).hierarchyCache;
        const relatedNotesCache = (adapter as any).relatedNotesCache;

        // Replace destroy with mock that throws on pageCache only
        pageCache.destroy = vi.fn(() => {
            throw new Error('pageCache destroy failed');
        });
        hierarchyCache.destroy = vi.fn();
        relatedNotesCache.destroy = vi.fn();

        // Invoke destroy; should NOT throw overall
        expect(() => adapter.destroy()).not.toThrow();

        // All caches attempted
        expect(pageCache.destroy).toHaveBeenCalledTimes(1);
        expect(hierarchyCache.destroy).toHaveBeenCalledTimes(1);
        expect(relatedNotesCache.destroy).toHaveBeenCalledTimes(1);
    });
});
