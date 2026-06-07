import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleGraphWorkerMessage, type WorkerMessage } from '../../../src/core/workers/graph-analysis-core';
import { TopologyAnalyzer } from '../../../src/core/TopologyAnalyzer';
import { GraphEngine } from '../../../src/core/GraphEngine';
import type { LlmService } from '../../../src/core/LlmService';
import type { IMetadataAdapter } from '../../../src/core/adapters/IMetadataAdapter';
import { TFile } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../../src/types';
import type { AnalysisContext } from '../../../src/core/services/PluginContext';

// Mock GraphEngine
vi.mock('../../../src/core/GraphEngine');

describe('Topology Diagnostics & Analysis', () => {
    describe('TOPOL-05: Black Hole Detection Thresholds', () => {
        const mockReporter = { postProgress: vi.fn() };

        it('should NOT flag a node with 6 incoming edges when threshold is 7 (default)', () => {
            const nodes = [{ key: 'SINK', attributes: {} }];
            const edges = [];
            for (let i = 0; i < 6; i++) {
                nodes.push({ key: `N${i}`, attributes: {} });
                edges.push({ source: `N${i}`, target: 'SINK', attributes: {} });
            }

            const message: WorkerMessage = {
                type: 'TOPOLOGY_DIAGNOSTICS',
                payload: { nodes, edges, requestId: 'test-7' },
                options: {}, // Use default blackHoleThreshold (7)
            };

            const response = handleGraphWorkerMessage(message, mockReporter);
            expect(response.type).toBe('RESULT');
            if (response.type === 'RESULT') {
                const data = response.payload.data as unknown as {
                    blackHoles: Array<{ path: string; inDegree: number }>;
                };
                expect(data.blackHoles.find((bh) => bh.path === 'SINK')).toBeUndefined();
            }
        });

        it('should flag a node with 7 incoming edges when threshold is 7 (default)', () => {
            const nodes = [{ key: 'SINK', attributes: {} }];
            const edges = [];
            for (let i = 0; i < 7; i++) {
                nodes.push({ key: `N${i}`, attributes: {} });
                edges.push({ source: `N${i}`, target: 'SINK', attributes: {} });
            }

            const message: WorkerMessage = {
                type: 'TOPOLOGY_DIAGNOSTICS',
                payload: { nodes, edges, requestId: 'test-8' },
                options: {}, // Use default blackHoleThreshold (7)
            };

            const response = handleGraphWorkerMessage(message, mockReporter);
            expect(response.type).toBe('RESULT');
            if (response.type === 'RESULT') {
                const data = response.payload.data as unknown as {
                    blackHoles: Array<{ path: string; inDegree: number }>;
                };
                expect(data.blackHoles.find((bh) => bh.path === 'SINK')).toBeDefined();
                expect(data.blackHoles.find((bh) => bh.path === 'SINK')?.inDegree).toBe(7);
            }
        });
    });

    describe('TOPOL-01: Bridge Scrutiny Transformation', () => {
        let analyzer: TopologyAnalyzer;
        let mockContext: AnalysisContext;
        let mockLlm: LlmService;
        let mockEngine: IMetadataAdapter;

        beforeEach(() => {
            const app = {
                vault: {
                    getAbstractFileByPath: vi.fn().mockImplementation((path: string) => {
                        const f = new TFile();
                        f.path = path;
                        f.basename = path.replace('.md', '');
                        return f;
                    }),
                },
                metadataCache: {
                    fileToLinktext: vi.fn().mockImplementation((file: TFile) => file.basename),
                },
            };
            mockContext = {
                app: app as unknown as AnalysisContext['app'],
                settings: { ...DEFAULT_SETTINGS },
                graphWorkerService: {} as AnalysisContext['graphWorkerService'],
                cache: {} as AnalysisContext['cache'],
                performanceService: {} as AnalysisContext['performanceService'],
                notifier: {} as AnalysisContext['notifier'],
            };
            mockLlm = {} as unknown as LlmService;
            mockEngine = {
                getPages: vi.fn().mockReturnValue([]),
            } as unknown as IMetadataAdapter;
            analyzer = new TopologyAnalyzer(mockContext, mockLlm, mockEngine);
        });

        it('should transform worker bridges into topology_gap suggestions with full metadata', async () => {
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
            const sug = suggestions[0];
            expect(sug.type).toBe('topology_gap');
            expect(sug.meta).toMatchObject({
                property: 'up',
                sourcePath: 'A.md',
                targetPath: 'C.md',
                sourceNote: 'A',
                targetNote: 'C',
            });
            expect(sug.source).toContain('[[A]]');
            expect(sug.source).toContain('[[B]]');
            expect(sug.source).toContain('[[C]]');
        });
    });

    describe('TOPOL-04: Ouroboros Boundary Scoping', () => {
        let analyzer: TopologyAnalyzer;
        let mockContext: AnalysisContext;
        let mockLlm: LlmService;
        let mockEngine: IMetadataAdapter;

        beforeEach(() => {
            const app = {
                vault: {
                    getAbstractFileByPath: vi.fn().mockImplementation((path: string) => {
                        const f = new TFile();
                        f.path = path;
                        const folderPath = path.includes('/') ? path.split('/').slice(0, -1).join('/') : '/';
                        f.parent = { path: folderPath } as TFile['parent'];
                        return f;
                    }),
                },
                metadataCache: {
                    fileToLinktext: vi.fn().mockImplementation((file: TFile) => file.basename),
                },
            };
            mockContext = {
                app: app as unknown as AnalysisContext['app'],
                settings: { ...DEFAULT_SETTINGS },
                graphWorkerService: {} as AnalysisContext['graphWorkerService'],
                cache: {} as AnalysisContext['cache'],
                performanceService: {} as AnalysisContext['performanceService'],
                notifier: {} as AnalysisContext['notifier'],
            };
            mockLlm = {} as unknown as LlmService;
            mockEngine = {
                getPages: vi.fn().mockReturnValue([]),
            } as unknown as IMetadataAdapter;
            analyzer = new TopologyAnalyzer(mockContext, mockLlm, mockEngine);
        });

        it('should correctly identify and filter boundary-crossing cycles', async () => {
            const mockResults = {
                bridges: [],
                cycles: [
                    { path: ['Folder1/A.md', 'Folder1/B.md'], type: 'hierarchy' }, // Internal Folder1
                    { path: ['Folder1/A.md', 'Folder2/C.md'], type: 'hierarchy' }, // Boundary Folder1 -> Folder2
                ],
                blackHoles: [],
            };

            const GraphEngineMock = vi.mocked(GraphEngine);
            GraphEngineMock.prototype.runTopologicalAnalysis = vi.fn().mockResolvedValue(mockResults);
            GraphEngineMock.prototype.buildGraph = vi.fn();

            // Test 1: Universal scope catches both
            mockContext.settings.ouroborosScope = 'universal';
            const suggestionsUniv = await analyzer.runCycleAnalysis();
            expect(suggestionsUniv).toHaveLength(2);

            // Test 2: Boundary scope catches only the cross-folder one
            mockContext.settings.ouroborosScope = 'boundary';
            const suggestionsBound = await analyzer.runCycleAnalysis();
            expect(suggestionsBound).toHaveLength(1);
            expect(suggestionsBound[0].meta?.losers).toContain('Folder2/C.md');
            expect(suggestionsBound[0].meta?.losers).toContain('Folder1/A.md');
        });
    });
});
