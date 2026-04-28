import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock HealerUtils BEFORE UnifiedMetadataAdapter import
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

    it('should not cache null hierarchy results — second call after data becomes available should hit adapter again', async () => {
        const bc = (adapter as any).breadcrumbs;
        const mockNode = { parents: [], children: [], siblings: [], next: [], prev: [] };

        // First call returns null (simulating transient miss)
        bc.getHierarchy.mockResolvedValueOnce(null);
        let res1 = await adapter.getHierarchy('test.md');
        expect(res1).toBeNull();
        expect(bc.getHierarchy).toHaveBeenCalledTimes(1);

        // Second call — adapter now returns a hierarchy
        bc.getHierarchy.mockResolvedValueOnce(mockNode);
        let res2 = await adapter.getHierarchy('test.md');
        expect(res2).toEqual(mockNode);
        // Should have called adapter twice because null was not cached
        expect(bc.getHierarchy).toHaveBeenCalledTimes(2);
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

    describe('stampede protection (coalescing)', () => {
        it('coalesces concurrent getHierarchy calls into single adapter invocation', async () => {
            const bc = (adapter as any).breadcrumbs;
            const mockNode = { parents: [], children: [], siblings: [], next: [], prev: [] };
            const mockPromise = Promise.resolve(mockNode);
            bc.getHierarchy.mockReturnValue(mockPromise);

            // Concurrent calls with same key
            const [res1, res2] = await Promise.all([adapter.getHierarchy('note'), adapter.getHierarchy('note')]);

            expect(bc.getHierarchy).toHaveBeenCalledTimes(1);
            expect(res1).toBe(mockNode);
            expect(res2).toBe(mockNode);
        });

        it('coalesces concurrent getRelatedNotes calls into single adapter invocation', async () => {
            const sc = (adapter as any).smartConnections;
            const mockNotes = [{ path: 'related.md', score: 0.9 }];
            const mockPromise = Promise.resolve(mockNotes);
            sc.getRelatedNotes.mockReturnValue(mockPromise);

            const [res1, res2] = await Promise.all([
                adapter.getRelatedNotes('note', 5),
                adapter.getRelatedNotes('note', 5),
            ]);

            expect(sc.getRelatedNotes).toHaveBeenCalledTimes(1);
            expect(res1).toEqual(mockNotes);
            expect(res2).toEqual(mockNotes);
        });
    });

    describe('destroy() lifecycle guard', () => {
        it('does not write to cache after destroy with pending coalesced promise', async () => {
            const bc = (adapter as any).breadcrumbs;
            const hierarchyCache = (adapter as any).hierarchyCache;
            const setSpy = vi.spyOn(hierarchyCache, 'set');

            let resolveHierarchy!: (v: any) => void;
            const pendingPromise = new Promise((res) => {
                resolveHierarchy = res;
            });
            bc.getHierarchy.mockReturnValue(pendingPromise);

            // Start the call (coalescing begins, factory awaits breadcrumbs.getHierarchy)
            const resultPromise = adapter.getHierarchy('a.md');

            // Destroy before resolution — sets _isDestroyed = true and clears inFlightMap
            adapter.destroy();

            // Resolve the underlying promise
            resolveHierarchy({ parents: [], children: [], siblings: [], next: [], prev: [] });

            const result = await resultPromise;

            // Result should still be the resolved value (adapter call already happened)
            expect(result).toEqual({ parents: [], children: [], siblings: [], next: [], prev: [] });

            // Cache set should not have been called because destroy happened before write-back
            expect(setSpy).not.toHaveBeenCalled();
        });

        it('getPage after destroy returns null without touching adapter or cache', () => {
            const datacore = (adapter as any).datacore;
            datacore.getPage.mockReturnValue({ file: { path: 'test.md' } });

            adapter.destroy();

            const result = adapter.getPage('test.md');
            expect(result).toBeNull();
            expect(datacore.getPage).not.toHaveBeenCalled();
        });

        it('getHierarchy after destroy returns null without invoking breadcrumbs', async () => {
            const bc = (adapter as any).breadcrumbs;
            bc.getHierarchy.mockResolvedValue({ parents: [], children: [], siblings: [], next: [], prev: [] });

            adapter.destroy();

            const result = await adapter.getHierarchy('test.md');
            expect(result).toBeNull();
            expect(bc.getHierarchy).not.toHaveBeenCalled();
        });

        it('getRelatedNotes after destroy returns [] without invoking smartConnections', async () => {
            const sc = (adapter as any).smartConnections;
            sc.getRelatedNotes.mockResolvedValue([{ path: 'related.md', score: 0.9 }]);

            adapter.destroy();

            const result = await adapter.getRelatedNotes('test.md', 5);
            expect(result).toEqual([]);
            expect(sc.getRelatedNotes).not.toHaveBeenCalled();
        });
    });

    describe('invalidate key normalization propagation', () => {
        it('passes normalized key to all adapters when path is provided', () => {
            const datacore = (adapter as any).datacore;
            const bc = (adapter as any).breadcrumbs;
            const sc = (adapter as any).smartConnections;

            // Use a path with trailing slash and uppercase to test normalization
            adapter.invalidate('Test.md/');

            // All adapters should receive the SAME normalized key (whatever normalizeVaultPath produces)
            const callsDatacore = datacore.invalidate.mock.calls[0][0];
            const callsBc = bc.invalidate.mock.calls[0][0];
            const callsSc = sc.invalidate.mock.calls[0][0];

            expect(callsDatacore).toBe(callsBc);
            expect(callsBc).toBe(callsSc);
            // Additionally, the key passed should be the one produced by normalizeCacheKey
            // We can compare against adapter's internal normalizedCacheKey if we expose it, but here we just check consistency.
        });

        it('passes undefined to adapters when no path given (global invalidate)', () => {
            const datacore = (adapter as any).datacore;
            const bc = (adapter as any).breadcrumbs;
            const sc = (adapter as any).smartConnections;

            adapter.invalidate();

            expect(datacore.invalidate).toHaveBeenCalledWith(undefined);
            expect(bc.invalidate).toHaveBeenCalledWith(undefined);
            expect(sc.invalidate).toHaveBeenCalledWith(undefined);
        });
    });
});
