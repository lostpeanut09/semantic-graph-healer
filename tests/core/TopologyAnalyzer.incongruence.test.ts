import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TopologyAnalyzer } from '../../src/core/TopologyAnalyzer';
import { TFile } from 'obsidian';

describe('TopologyAnalyzer Semantic Incongruence Diagnostic', () => {
    let analyzer: any;
    let mockContext: any;
    let mockEngine: any;

    beforeEach(() => {
        vi.clearAllMocks();

        const vectorEmbeddings: Record<string, any> = {
            'A.md': { vector: [1, 0, 0] },
            'B.md': { vector: [0, 1, 0] }, // Orthogonal = 0 similarity
            'C.md': { vector: [1, 0, 0] },
        };

        mockContext = {
            app: {
                vault: {
                    getAbstractFileByPath: vi.fn().mockImplementation((path: string) => {
                        const f = new TFile();
                        (f as any).path = path;
                        (f as any).basename = path.replace('.md', '').split('/').pop();
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
                vectorEmbeddings,
                _cache: {
                    vectorEmbeddings,
                },
            },
        };

        mockEngine = {
            getPages: vi
                .fn()
                .mockReturnValue([
                    { file: { path: 'A.md', basename: 'A' } },
                    { file: { path: 'B.md', basename: 'B' } },
                ]),
        };

        analyzer = new TopologyAnalyzer(mockContext as any, {} as any, mockEngine as any);
    });

    it('should flag links with low semantic similarity', async () => {
        const suggestions = await analyzer.runSemanticIncongruenceAnalysis();
        expect(suggestions).toHaveLength(1);
        expect(suggestions[0].type).toBe('semantic_incongruence');
        expect(suggestions[0].source).toContain('diverged semantically');
        expect(suggestions[0].id).toContain('semantic_incongruence:A.md:B.md');
    });

    it('should not flag links with high semantic similarity', async () => {
        // Change vector of B to be similar to A
        mockContext.cache.vectorEmbeddings['B.md'] = { vector: [1, 0, 0] }; // Cosine sim = 1

        const suggestions = await analyzer.runSemanticIncongruenceAnalysis();
        expect(suggestions).toHaveLength(0);
    });

    it('should not flag if embeddings are missing', async () => {
        mockContext.cache.vectorEmbeddings = {};

        const suggestions = await analyzer.runSemanticIncongruenceAnalysis();
        expect(suggestions).toHaveLength(0);
    });
});
