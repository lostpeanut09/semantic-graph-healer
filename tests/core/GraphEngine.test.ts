import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphEngine } from '../../src/core/GraphEngine';
import type { GraphContext } from '../../src/core/services/PluginContext';
import { TFile } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../src/types';

interface MockCTX {
    app: {
        vault: {
            getMarkdownFiles: ReturnType<typeof vi.fn>;
            getAbstractFileByPath: ReturnType<typeof vi.fn>;
            adapter: {
                exists: ReturnType<typeof vi.fn>;
                read: ReturnType<typeof vi.fn>;
                write: ReturnType<typeof vi.fn>;
            };
        };
        metadataCache: {
            resolvedLinks: Record<string, Record<string, number>>;
            getFileCache: ReturnType<typeof vi.fn>;
            getFirstLinkpathDest: ReturnType<typeof vi.fn>;
            fileToLinktext: ReturnType<typeof vi.fn>;
        };
    };
    settings: typeof DEFAULT_SETTINGS;
    cache: {
        topologicalScores: {
            pageRank: Record<string, number>;
            betweenness: Record<string, number>;
            communities: Record<string, number>;
            lastAnalysisTimestamp: number;
            graphVersion: string;
        };
        save: ReturnType<typeof vi.fn>;
    };
    graphWorkerService: { runAnalysis: ReturnType<typeof vi.fn> };
    performanceService: {
        isSafetyModeActive: ReturnType<typeof vi.fn>;
        getPerformanceMode: ReturnType<typeof vi.fn>;
    };
}

describe('GraphEngine', () => {
    let engine: GraphEngine;
    let mockContext: MockCTX;

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

        engine = new GraphEngine(mockContext as unknown as GraphContext);
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
            (f as unknown as { path: string; basename: string }).path = path;
            (f as unknown as { path: string; basename: string }).basename = path;
            return f;
        });

        await engine.runPageRankAnalysis();

        expect(mockContext.graphWorkerService.runAnalysis).toHaveBeenCalled();
        expect(mockContext.cache.topologicalScores.pageRank).toEqual({
            'Note.md': 0.5,
        });
    });
});
