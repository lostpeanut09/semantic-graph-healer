import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphRagService } from '../../../src/core/services/GraphRagService';
import { DEFAULT_SETTINGS } from '../../../src/types';

describe('GraphRagService Query', () => {
    let service: GraphRagService;
    let mockGraphEngine: any;
    let mockLlmService: any;
    let mockEmbeddingService: any;
    let mockStorage: any;
    let mockAdapter: any;
    let mockSettings: any;

    beforeEach(() => {
        mockSettings = { ...DEFAULT_SETTINGS, graphRagIndexDir: '.planning/index' };
        mockGraphEngine = {
            getTopologicalMetrics: vi.fn(),
        };
        mockLlmService = {
            callLlm: vi.fn(),
        };
        mockEmbeddingService = {
            getEmbedding: vi.fn(),
        };
        mockStorage = {
            readAll: vi.fn(),
            upsert: vi.fn(),
        };
        mockAdapter = {
            exists: vi.fn(),
            mkdir: vi.fn(),
        };
        service = new GraphRagService(
            mockGraphEngine,
            mockLlmService,
            mockEmbeddingService,
            mockStorage,
            mockAdapter,
            mockSettings
        );
    });

    it('should perform a context-aware RAG query', async () => {
        const queryText = 'What is the project about?';
        const mockQueryVector = [0.1, 0.2];
        
        mockEmbeddingService.getEmbedding.mockResolvedValue(mockQueryVector);
        
        mockStorage.readAll.mockImplementation((path: string) => {
            if (path.includes('community_summaries')) {
                return Promise.resolve([
                    {
                        communityId: 1,
                        summary: 'Project X details',
                        embedding: [0.1, 0.2],
                        notes: ['note1.md', 'note2.md']
                    }
                ]);
            }
            if (path.includes('entities')) {
                return Promise.resolve([
                    { name: 'John', type: 'Person', notePath: 'note1.md' }
                ]);
            }
            return Promise.resolve([]);
        });

        mockLlmService.callLlm.mockResolvedValue('The project is about X.');

        const result = await service.query(queryText);

        expect(mockEmbeddingService.getEmbedding).toHaveBeenCalledWith(queryText);
        expect(mockLlmService.callLlm).toHaveBeenCalledWith(expect.stringContaining('GRAPH CONTEXT'), false);
        expect(mockLlmService.callLlm).toHaveBeenCalledWith(expect.stringContaining('John (Person)'), false);
        expect(result).toBe('The project is about X.');
    });

    it('should handle missing indices gracefully', async () => {
        mockEmbeddingService.getEmbedding.mockResolvedValue([0, 0]);
        mockStorage.readAll.mockResolvedValue([]);
        mockLlmService.callLlm.mockResolvedValue('I dont know.');

        const result = await service.query('query');
        expect(result).toBe('I dont know.');
    });
});
