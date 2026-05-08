import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopologyAnalyzer } from '../../src/core/TopologyAnalyzer';
import { GraphEngine } from '../../src/core/GraphEngine';
import { TFile } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../src/types';

// Properly mock the module
vi.mock('../../src/core/GraphEngine');

describe('TopologyAnalyzer', () => {
    let analyzer: TopologyAnalyzer;
    let mockContext: any;
    let mockLlm: any;
    let mockEngine: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockContext = {
            app: {
                vault: {
                    getAbstractFileByPath: vi.fn().mockImplementation((path: string) => {
                        if (!path) return null;
                        const f = new TFile();
                        (f as any).path = path;
                        (f as any).basename = path.replace('.md', '').split('/').pop();
                        (f as any).name = path.split('/').pop();
                        (f as any).extension = path.split('.').pop();
                        const folderPath = path.includes('/') ? path.split('/').slice(0, -1).join('/') : '/';
                        (f as any).parent = { path: folderPath };
                        return f;
                    }),
                },
                metadataCache: {
                    fileToLinktext: vi.fn().mockReturnValue('mock-link'),
                    getFirstLinkpathDest: vi.fn(),
                },
            },
            settings: { ...DEFAULT_SETTINGS },
            cache: {
                suggestions: [],
                save: vi.fn(),
                pushHistory: vi.fn(),
            },
            graphWorkerService: {},
        };

        mockLlm = {};
        mockEngine = {
            getPages: vi.fn().mockReturnValue([]),
        };

        analyzer = new TopologyAnalyzer(mockContext, mockLlm, mockEngine);
    });

    it('should map worker bridges to suggestions in runBridgeScrutiny', async () => {
        const mockResults = {
            bridges: [{ source: 'A.md', target: 'C.md', via: 'B.md', type: 'up' }],
            cycles: [],
            blackHoles: [],
        };

        const GraphEngineMock = vi.mocked(GraphEngine);
        GraphEngineMock.prototype.runTopologicalAnalysis = vi.fn().mockResolvedValue(mockResults);
        GraphEngineMock.prototype.buildGraph = vi.fn();

        const suggestions = await analyzer.runBridgeScrutiny();

        expect(suggestions).toHaveLength(1);
        expect(suggestions[0].id).toContain('bridge_gap:up:A.md:B.md:C.md');
        expect(suggestions[0].type).toBe('topology_gap');
        expect(suggestions[0].meta?.sourcePath).toBe('A.md');
        expect(suggestions[0].meta?.targetPath).toBe('C.md');
    });

    it('should filter cycles based on boundary scope in runCycleAnalysis', async () => {
        const mockResults = {
            bridges: [],
            cycles: [
                { path: ['F1/A.md', 'F1/B.md'], type: 'hierarchy' }, // Internal
                { path: ['F1/A.md', 'F2/C.md'], type: 'hierarchy' }, // Boundary
            ],
            blackHoles: [],
        };

        const GraphEngineMock = vi.mocked(GraphEngine);
        GraphEngineMock.prototype.runTopologicalAnalysis = vi.fn().mockResolvedValue(mockResults);
        GraphEngineMock.prototype.buildGraph = vi.fn();

        // 1. Universal scope
        mockContext.settings.ouroborosScope = 'universal';
        const suggestionsUniv = await analyzer.runCycleAnalysis();
        expect(suggestionsUniv).toHaveLength(2);

        // 2. Boundary scope
        mockContext.settings.ouroborosScope = 'boundary';
        const suggestionsBound = await analyzer.runCycleAnalysis();
        expect(suggestionsBound).toHaveLength(1);
        expect(suggestionsBound[0].meta?.losers).toContain('F2/C.md');
    });

    it('should map worker black holes to suggestions in runFlowStagnationAnalysis', async () => {
        const mockResults = {
            bridges: [],
            cycles: [],
            blackHoles: [{ path: 'Sink.md', inDegree: 10 }],
        };

        const GraphEngineMock = vi.mocked(GraphEngine);
        GraphEngineMock.prototype.runTopologicalAnalysis = vi.fn().mockResolvedValue(mockResults);
        GraphEngineMock.prototype.buildGraph = vi.fn();

        const suggestions = await analyzer.runFlowStagnationAnalysis();

        expect(suggestions).toHaveLength(1);
        expect(suggestions[0].id).toContain('sink_stagnation:Sink.md');
        expect(suggestions[0].source).toContain('attracts 10 links');
    });
});
