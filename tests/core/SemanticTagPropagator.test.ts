import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SemanticTagPropagator } from '../../src/core/SemanticTagPropagator';
import { TFile } from 'obsidian';
import type { App, MetadataCache } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../src/types';
import type { SemanticGraphHealerSettings } from '../../src/types';
import type { VaultQueryEngine } from '../../src/core/DataAdapter';
import type { LlmService } from '../../src/core/LlmService';

type MockApp = App & {
    vault: {
        getAbstractFileByPath: ReturnType<typeof vi.fn>;
    };
    metadataCache: MetadataCache & {
        getFileCache: ReturnType<typeof vi.fn>;
        getFirstLinkpathDest?: ReturnType<typeof vi.fn>;
    };
};

type MockEngine = VaultQueryEngine & {
    getPages: ReturnType<typeof vi.fn>;
};

describe('SemanticTagPropagator', () => {
    let propagator: SemanticTagPropagator;
    let mockApp: MockApp;
    let mockSettings: SemanticGraphHealerSettings;
    let mockEngine: MockEngine;
    let mockLlm: LlmService;

    beforeEach(() => {
        mockApp = {
            vault: {
                getAbstractFileByPath: vi.fn().mockImplementation((path: string) => {
                    if (!path) return null;
                    const f = new TFile();
                    (f as unknown as { path: string }).path = path;
                    (f as unknown as { basename: string }).basename = path.replace('.md', '').split('/').pop() ?? path;
                    return f;
                }),
            },
            metadataCache: {
                getFileCache: vi.fn().mockReturnValue({}),
            } as unknown as MockApp['metadataCache'],
        } as unknown as MockApp;

        mockSettings = {
            ...DEFAULT_SETTINGS,
            tagPropagationThreshold: 0.5,
            tagPropagationExclusions: ['MOC', 'Index', 'Dashboard'],
            hierarchies: [
                {
                    up: ['parent'],
                    down: ['child'],
                },
            ],
        } as unknown as SemanticGraphHealerSettings;

        mockEngine = {
            getPages: vi.fn().mockReturnValue([]),
        } as unknown as MockEngine;

        mockLlm = {} as LlmService;

        propagator = new SemanticTagPropagator(mockApp, mockSettings, mockEngine, mockLlm);
    });

    it('should suggest tag propagation when majority threshold is met', () => {
        // Setup: Parent P has children C1, C2, C3.
        // C1 and C2 have tag #science. C3 does not.
        // Threshold is 0.5. 2/3 = 0.66 > 0.5. Should suggest for C3.

        const mockPages = [
            { file: { path: 'C1.md' }, parent: 'P.md' },
            { file: { path: 'C2.md' }, parent: 'P.md' },
            { file: { path: 'C3.md' }, parent: 'P.md' },
            { file: { path: 'P.md' } },
        ];

        mockEngine.getPages.mockReturnValue(mockPages);

        // Mock metadata for each file
        (mockApp.metadataCache.getFileCache as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            (file: TFile) => {
                if (file.path === 'P.md') return { tags: [{ tag: '#science' }] };
                if (file.path === 'C1.md') return { tags: [{ tag: '#science' }] };
                if (file.path === 'C2.md') return { tags: [{ tag: '#science' }] };
                if (file.path === 'C3.md') return { tags: [] };
                return {};
            },
        );

        // We need to fix the parent-child resolution in the test
        // The propagator uses extractLinkpaths and resolveLinkpathsToPaths
        // For simplicity in test, let's mock HealerUtils if needed, or ensure data fits
        // The current SemanticTagPropagator implementation:
        // const linkpaths = extractLinkpaths(page, hierarchyKeys);
        // const parentPaths = resolveLinkpathsToPaths(this.app, linkpaths, page.file.path, resolverCache);

        // Let's mock the page objects to have the expected property
        const mockPagesWithParents = [
            { file: { path: 'C1.md', basename: 'C1' }, parent: '[[P]]' },
            { file: { path: 'C2.md', basename: 'C2' }, parent: '[[P]]' },
            { file: { path: 'C3.md', basename: 'C3' }, parent: '[[P]]' },
            { file: { path: 'P.md', basename: 'P' } },
        ];
        mockEngine.getPages.mockReturnValue(mockPagesWithParents);

        mockApp.metadataCache.getFirstLinkpathDest = vi.fn().mockImplementation((link: string) => {
            if (link === 'P') return { path: 'P.md' } as TFile;
            return null;
        });

        const suggestions = propagator.runTagPropagationAnalysis();

        expect(suggestions).toHaveLength(1);
        expect(suggestions[0].meta?.targetNote).toBe('C3');
        expect(suggestions[0].meta?.winner).toBe('science');
    });

    it('should respect the exclusion list', () => {
        const mockPages = [
            { file: { path: 'C1.md', basename: 'C1' }, parent: '[[P]]' },
            { file: { path: 'C2.md', basename: 'C2' }, parent: '[[P]]' },
            { file: { path: 'P.md', basename: 'P' } },
        ];
        mockEngine.getPages.mockReturnValue(mockPages);

        mockApp.metadataCache.getFirstLinkpathDest = vi.fn().mockImplementation((link: string) => {
            if (link === 'P') return { path: 'P.md' } as TFile;
            return null;
        });

        (mockApp.metadataCache.getFileCache as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            (file: TFile) => {
                if (file.path === 'P.md') return { tags: [{ tag: '#MOC' }, { tag: '#science' }] };
                if (file.path === 'C1.md') return { tags: [{ tag: '#science' }] };
                if (file.path === 'C2.md') return { tags: [] };
                return {};
            },
        );

        const suggestions = propagator.runTagPropagationAnalysis();

        // Should suggest #science but NOT #MOC
        const suggestedTags = suggestions.map((s) => s.meta?.winner);
        expect(suggestedTags).toContain('science');
        expect(suggestedTags).not.toContain('MOC');
    });

    it('should handle nested tags correctly', () => {
        const mockPages = [
            { file: { path: 'C1.md', basename: 'C1' }, parent: '[[P]]' },
            { file: { path: 'C2.md', basename: 'C2' }, parent: '[[P]]' },
            { file: { path: 'P.md', basename: 'P' } },
        ];
        mockEngine.getPages.mockReturnValue(mockPages);

        mockApp.metadataCache.getFirstLinkpathDest = vi.fn().mockImplementation((link: string) => {
            if (link === 'P') return { path: 'P.md' } as TFile;
            return null;
        });

        (mockApp.metadataCache.getFileCache as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            (file: TFile) => {
                if (file.path === 'P.md') return { tags: [{ tag: '#science' }] };
                if (file.path === 'C1.md') return { tags: [{ tag: '#science/biology' }] }; // Nested
                if (file.path === 'C2.md') return { tags: [] };
                return {};
            },
        );

        const suggestions = propagator.runTagPropagationAnalysis();

        // C1 has #science/biology, which counts as having #science.
        // Coverage is 1/2 = 0.5. Threshold is 0.5. Should suggest for C2.
        expect(suggestions).toHaveLength(1);
        expect(suggestions[0].meta?.targetNote).toBe('C2');
        expect(suggestions[0].meta?.winner).toBe('science');
    });

    it('should skip clusters with fewer than two children', () => {
        const mockPages = [
            { file: { path: 'C1.md', basename: 'C1' }, parent: '[[P]]' },
            { file: { path: 'P.md', basename: 'P' } },
        ];
        mockEngine.getPages.mockReturnValue(mockPages);

        mockApp.metadataCache.getFirstLinkpathDest = vi.fn().mockImplementation((link: string) => {
            if (link === 'P') return { path: 'P.md' } as TFile;
            return null;
        });

        (mockApp.metadataCache.getFileCache as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            (file: TFile) => {
                if (file.path === 'P.md') return { tags: [{ tag: '#science' }] };
                if (file.path === 'C1.md') return { tags: [] };
                return {};
            },
        );

        const suggestions = propagator.runTagPropagationAnalysis();
        expect(suggestions).toHaveLength(0);
    });

    it('should not suggest anything if coverage is 100%', () => {
        const mockPages = [
            { file: { path: 'C1.md', basename: 'C1' }, parent: '[[P]]' },
            { file: { path: 'C2.md', basename: 'C2' }, parent: '[[P]]' },
            { file: { path: 'P.md', basename: 'P' } },
        ];
        mockEngine.getPages.mockReturnValue(mockPages);

        mockApp.metadataCache.getFirstLinkpathDest = vi.fn().mockImplementation((link: string) => {
            if (link === 'P') return { path: 'P.md' } as TFile;
            return null;
        });

        (mockApp.metadataCache.getFileCache as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            (file: TFile) => {
                if (file.path === 'P.md') return { tags: [{ tag: '#science' }] };
                if (file.path === 'C1.md') return { tags: [{ tag: '#science' }] };
                if (file.path === 'C2.md') return { tags: [{ tag: '#science' }] };
                return {};
            },
        );

        const suggestions = propagator.runTagPropagationAnalysis();
        expect(suggestions).toHaveLength(0);
    });
});
