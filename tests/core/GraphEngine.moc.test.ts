import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphEngine } from '../../src/core/GraphEngine';
import { TFile } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../src/types';

describe('GraphEngine MOC Suggestions', () => {
    let engine: GraphEngine;
    let mockContext: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockContext = {
            app: {
                vault: {
                    getMarkdownFiles: vi.fn().mockReturnValue([
                        { path: 'A.md', basename: 'A', stat: { size: 100 } },
                        { path: 'B.md', basename: 'B', stat: { size: 100 } },
                        { path: 'C.md', basename: 'C', stat: { size: 100 } },
                        { path: 'D.md', basename: 'D', stat: { size: 100 } },
                        { path: 'E.md', basename: 'E', stat: { size: 100 } },
                        { path: 'F.md', basename: 'F', stat: { size: 100 } },
                        { path: 'MOC-Test.md', basename: 'MOC-Test', stat: { size: 100 } },
                    ]),
                    getAbstractFileByPath: vi.fn(),
                },
                metadataCache: {
                    resolvedLinks: {
                        'A.md': { 'B.md': 1 },
                        'B.md': { 'C.md': 1 },
                        'C.md': { 'A.md': 1 }, // Ensure convergence
                    },
                    getFileCache: vi.fn().mockReturnValue({ tags: [] }),
                    getFirstLinkpathDest: vi.fn(),
                    fileToLinktext: vi.fn().mockReturnValue('mock-link'),
                },
            },
            settings: {
                ...DEFAULT_SETTINGS,
                mocSaturationThreshold: 5, // Low for testing
            },
            cache: {
                topologicalScores: {
                    pageRank: {},
                    betweenness: {},
                    communities: {},
                    lastAnalysisTimestamp: 0,
                    graphVersion: '',
                },
                save: vi.fn(),
            },
            graphWorkerService: {
                runAnalysis: vi.fn(),
            },
        };

        engine = new GraphEngine(mockContext);
        engine.buildGraph();
    });

    it('should suggest an MOC for a large cluster without an existing MOC', async () => {
        const communities = {
            'A.md': 1,
            'B.md': 1,
            'C.md': 1,
            'D.md': 1,
            'E.md': 1,
            'F.md': 1,
        };

        mockContext.graphWorkerService.runAnalysis.mockResolvedValue(communities);

        mockContext.app.vault.getAbstractFileByPath.mockImplementation((path: string) => {
            const f = new TFile();
            (f as any).path = path;
            (f as any).name = path;
            (f as any).basename = path.replace('.md', '');
            return f;
        });

        const suggestions = await engine.runCommunityDetection();

        const mocSuggestions = suggestions.filter((s) => s.id.startsWith('moc_suggestion:'));
        expect(mocSuggestions).toHaveLength(1);
        expect(mocSuggestions[0].source).toContain('lacks a dedicated Map of Content');
    });

    it('should NOT suggest an MOC if one already exists in the cluster', async () => {
        const communities = {
            'A.md': 1,
            'B.md': 1,
            'C.md': 1,
            'D.md': 1,
            'E.md': 1,
            'MOC-Test.md': 1,
        };

        mockContext.graphWorkerService.runAnalysis.mockResolvedValue(communities);

        mockContext.app.vault.getAbstractFileByPath.mockImplementation((path: string) => {
            const f = new TFile();
            (f as any).path = path;
            (f as any).name = path;
            (f as any).basename = path.replace('.md', '');
            return f;
        });

        const suggestions = await engine.runCommunityDetection();

        const mocSuggestions = suggestions.filter((s) => s.id.startsWith('moc_suggestion:'));
        expect(mocSuggestions).toHaveLength(0);
    });
});
