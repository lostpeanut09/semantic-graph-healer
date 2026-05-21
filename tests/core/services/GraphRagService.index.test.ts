import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphRagService } from '../../../src/core/services/GraphRagService';
import { AjsonStorage } from '../../../src/core/utils/AjsonStorage';

vi.mock('obsidian', () => ({
    requestUrl: vi.fn(),
    TFile: class {},
}));

describe('GraphRagService Indexing', () => {
    let service: GraphRagService;
    let mockGraphEngine: any;
    let mockLlmService: any;
    let mockEmbeddingService: any;
    let mockStorage: any;
    let mockAdapter: any;
    let mockSettings: any;

    beforeEach(() => {
        mockGraphEngine = {
            getCacheStatus: vi.fn().mockReturnValue({ valid: true }),
            getGraph: vi.fn().mockReturnValue({
                nodes: vi.fn().mockReturnValue(['note1.md', 'note2.md', 'note3.md']),
            }),
            context: {
                cache: {
                    topologicalScores: {
                        communities: {
                            'note1.md': 1,
                            'note2.md': 1,
                            'note3.md': 2,
                        },
                    },
                },
            },
        };

        mockLlmService = {
            callLlm: vi.fn().mockResolvedValue('Summary for community'),
        };

        mockEmbeddingService = {
            getEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
        };

        mockAdapter = {
            exists: vi.fn().mockResolvedValue(true),
            append: vi.fn().mockResolvedValue(undefined),
            write: vi.fn().mockResolvedValue(undefined),
            read: vi.fn().mockResolvedValue(''),
            mkdir: vi.fn().mockResolvedValue(undefined),
        };

        mockStorage = new AjsonStorage(mockAdapter);
        mockSettings = {
            graphRagIndexDir: '.planning/index',
        };

        service = new GraphRagService(
            mockGraphEngine as any,
            mockLlmService as any,
            mockEmbeddingService as any,
            mockStorage,
            mockAdapter as any,
            mockSettings as any,
        );
    });

    it('should generate summaries and embeddings for communities', async () => {
        await service.indexCommunities();

        // 2 communities (1 and 2)
        expect(mockLlmService.callLlm).toHaveBeenCalledTimes(2);
        expect(mockEmbeddingService.getEmbedding).toHaveBeenCalledTimes(2);
        // Should write to .planning/index/community_summaries.ajson
        expect(mockAdapter.write).toHaveBeenCalled();
    });
});
