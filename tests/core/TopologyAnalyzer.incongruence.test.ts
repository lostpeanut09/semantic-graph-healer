import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopologyAnalyzer } from '../../src/core/TopologyAnalyzer';
import { TFile } from 'obsidian';
import type { AnalysisContext } from '../../src/core/services/PluginContext';
import type { LlmService } from '../../src/core/LlmService';
import type { IMetadataAdapter } from '../../src/core/adapters/IMetadataAdapter';

describe('TopologyAnalyzer Semantic Incongruence Diagnostic', () => {
    let analyzer: TopologyAnalyzer;
    let mockContext: AnalysisContext;
    let mockEngine: IMetadataAdapter;

    beforeEach(() => {
        vi.clearAllMocks();

        const vectorEmbeddings: Record<string, unknown> = {
            'A.md': { vector: [1, 0, 0] },
            'B.md': { vector: [0, 1, 0] }, // Orthogonal = 0 similarity
            'C.md': { vector: [1, 0, 0] },
        };

        mockContext = {
            app: {
                vault: {
                    getAbstractFileByPath: vi.fn().mockImplementation((path: string) => {
                        const f = new TFile() as unknown as {
                            path: string;
                            basename: string;
                        };
                        f.path = path;
                        f.basename = path.replace('.md', '').split('/').pop() ?? '';
                        return f;
                    }),
                },
                metadataCache: {
                    resolvedLinks: {
                        'A.md': { 'B.md': 1 }, // Link from A to B
                    },
                    fileToLinktext: vi.fn().mockReturnValue('mock-link'),
                },
            },
            settings: {
                scanFolder: '/',
                hierarchies: [{ up: [], down: [], next: [], prev: [], same: [], related: [] }],
                customTopologyRules: [],
            },
            cache: {
                vectorEmbeddings: vectorEmbeddings as never,
                _cache: {
                    vectorEmbeddings,
                },
            },
        } as unknown as AnalysisContext;

        mockEngine = {
            getPages: vi
                .fn()
                .mockReturnValue([
                    { file: { path: 'A.md', basename: 'A' } },
                    { file: { path: 'B.md', basename: 'B' } },
                ]),
        } as unknown as IMetadataAdapter;

        analyzer = new TopologyAnalyzer(mockContext, {} as LlmService, mockEngine);
    });

    it('should flag links with low semantic similarity', async () => {
        const suggestions = await analyzer.runSemanticIncongruenceAnalysis();
        expect(suggestions).toHaveLength(1);
        expect(suggestions[0].type).toBe('incongruence');
        expect(suggestions[0].source).toContain('diverged semantically');
        expect(suggestions[0].id).toContain('semantic_incongruence:A.md:B.md');
    });

    it('should not flag links with high semantic similarity', async () => {
        // Change vector of B to be similar to A
        (mockContext.cache.vectorEmbeddings as Record<string, unknown>)['B.md'] = {
            vector: [1, 0, 0],
        }; // Cosine sim = 1

        const suggestions = await analyzer.runSemanticIncongruenceAnalysis();
        expect(suggestions).toHaveLength(0);
    });

    it('should not flag if embeddings are missing', async () => {
        (mockContext.cache as { vectorEmbeddings: Record<string, unknown> }).vectorEmbeddings = {};

        const suggestions = await analyzer.runSemanticIncongruenceAnalysis();
        expect(suggestions).toHaveLength(0);
    });
});
