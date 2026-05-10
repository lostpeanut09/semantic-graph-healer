import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SemanticTagPropagator } from '../../src/core/SemanticTagPropagator';
import { TFile } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../src/types';

describe('SemanticTagPropagator', () => {
    let propagator: SemanticTagPropagator;
    let mockApp: any;
    let mockSettings: any;
    let mockEngine: any;
    let mockLlm: any;

    beforeEach(() => {
        mockApp = {
            vault: {
                getAbstractFileByPath: vi.fn().mockImplementation((path: string) => {
                    if (!path) return null;
                    const f = new TFile();
                    (f as any).path = path;
                    (f as any).basename = path.replace('.md', '').split('/').pop();
                    return f;
                }),
            },
            metadataCache: {
                getFileCache: vi.fn().mockReturnValue({}),
            },
        };

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
        };

        mockEngine = {
            getPages: vi.fn().mockReturnValue([]),
        };

        mockLlm = {};

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
        mockApp.metadataCache.getFileCache.mockImplementation((file: TFile) => {
            if (file.path === 'P.md') return { tags: [{ tag: '#science' }] };
            if (file.path === 'C1.md') return { tags: [{ tag: '#science' }] };
            if (file.path === 'C2.md') return { tags: [{ tag: '#science' }] };
            if (file.path === 'C3.md') return { tags: [] };
            return {};
        });

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
            if (link === 'P') return { path: 'P.md' };
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
            if (link === 'P') return { path: 'P.md' };
            return null;
        });

        mockApp.metadataCache.getFileCache.mockImplementation((file: TFile) => {
            if (file.path === 'P.md') return { tags: [{ tag: '#MOC' }, { tag: '#science' }] };
            if (file.path === 'C1.md') return { tags: [{ tag: '#science' }] };
            if (file.path === 'C2.md') return { tags: [] };
            return {};
        });

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
            if (link === 'P') return { path: 'P.md' };
            return null;
        });

        mockApp.metadataCache.getFileCache.mockImplementation((file: TFile) => {
            if (file.path === 'P.md') return { tags: [{ tag: '#science' }] };
            if (file.path === 'C1.md') return { tags: [{ tag: '#science/biology' }] }; // Nested
            if (file.path === 'C2.md') return { tags: [] };
            return {};
        });

        const suggestions = propagator.runTagPropagationAnalysis();

        // C1 has #science/biology, which counts as having #science.
        // Coverage is 1/2 = 0.5. Threshold is 0.5. Should suggest for C2.
        expect(suggestions).toHaveLength(1);
        expect(suggestions[0].meta?.targetNote).toBe('C2');
        expect(suggestions[0].meta?.winner).toBe('science');
    });
});
