import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphEngine } from '../../src/core/GraphEngine';
import { TFile } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../src/types';

describe('GraphEngine', () => {
    let engine: GraphEngine;
    let mockContext: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockContext = {
            app: {
                vault: {
                    getMarkdownFiles: vi.fn().mockReturnValue([]),
                    getAbstractFileByPath: vi.fn(),
                    adapter: {
                        exists: vi.fn(),
                        read: vi.fn(),
                        write: vi.fn(),
                    },
                },
                metadataCache: {
                    resolvedLinks: {},
                    getFileCache: vi.fn(),
                    getFirstLinkpathDest: vi.fn(),
                    fileToLinktext: vi.fn().mockReturnValue('mock-link'),
                },
            },
            settings: { ...DEFAULT_SETTINGS },
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
            performanceService: {
                isSafetyModeActive: vi.fn().mockReturnValue(false),
                getPerformanceMode: vi.fn().mockReturnValue('Standard'),
            },
        };

        engine = new GraphEngine(mockContext);
    });

    it('should use cached PageRank if valid', async () => {
        // Set up valid cache
        mockContext.cache.topologicalScores = {
            pageRank: { 'Note.md': 0.9 },
            betweenness: {},
            communities: {},
            lastAnalysisTimestamp: Date.now(),
            graphVersion: '0:0:1', // order:size:version
        };

        // Mock buildGraph to set fingerprint
        engine.buildGraph(); // nodes: 0, edges: 0, version: 1 -> "0:0:1"

        const suggestions = await engine.runPageRankAnalysis();

        expect(suggestions).toHaveLength(1);
        expect(suggestions[0].id).toContain('pagerank_auth:Note.md');
        expect(mockContext.graphWorkerService.runAnalysis).not.toHaveBeenCalled();
    });

    it('should run worker PageRank if cache is invalid', async () => {
        mockContext.cache.topologicalScores.graphVersion = 'INVALID';

        mockContext.graphWorkerService.runAnalysis.mockResolvedValue({
            'Note.md': 0.5,
        });

        mockContext.app.vault.getAbstractFileByPath.mockImplementation((path: string) => {
            const f = new TFile();
            (f as any).path = path;
            (f as any).basename = path;
            return f;
        });

        await engine.runPageRankAnalysis();

        expect(mockContext.graphWorkerService.runAnalysis).toHaveBeenCalled();
        expect(mockContext.cache.topologicalScores.pageRank).toEqual({
            'Note.md': 0.5,
        });
    });
});
