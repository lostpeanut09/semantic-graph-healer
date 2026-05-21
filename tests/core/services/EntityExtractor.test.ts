import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityExtractor } from '../../../src/core/services/EntityExtractor';
import { TFile } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../../src/types';

describe('EntityExtractor', () => {
    let extractor: EntityExtractor;
    let mockLlmService: any;
    let mockStorage: any;
    let mockSettings: any;

    beforeEach(() => {
        mockSettings = { ...DEFAULT_SETTINGS, graphRagIndexDir: '.planning/index' };
        mockLlmService = {
            callLlm: vi.fn(),
        };
        mockStorage = {
            appendLine: vi.fn(),
            exists: vi.fn().mockResolvedValue(true),
        };
        extractor = new EntityExtractor(mockSettings, mockLlmService, mockStorage);
    });

    it('should extract entities and relationships and save them to storage', async () => {
        const mockFile = { path: 'test.md', basename: 'test' } as TFile;
        const mockContent = 'John works on Project X using React.';
        
        const mockResponse = JSON.stringify({
            entities: [
                { name: 'John', type: 'Person' },
                { name: 'Project X', type: 'Project' },
                { name: 'React', type: 'Technology' }
            ],
            relationships: [
                { source: 'John', target: 'Project X', type: 'works on' },
                { source: 'Project X', target: 'React', type: 'uses' }
            ]
        });

        mockLlmService.callLlm.mockResolvedValue(mockResponse);

        await extractor.extractFromNote(mockFile, mockContent);

        expect(mockLlmService.callLlm).toHaveBeenCalled();
        expect(mockStorage.appendLine).toHaveBeenCalledTimes(5); // 3 entities + 2 relationships
        
        expect(mockStorage.appendLine).toHaveBeenCalledWith(
            '.planning/index/entities.ajson',
            expect.objectContaining({ name: 'John', type: 'Person', notePath: 'test.md' })
        );
        
        expect(mockStorage.appendLine).toHaveBeenCalledWith(
            '.planning/index/relationships.ajson',
            expect.objectContaining({ source: 'John', target: 'Project X', type: 'works on', notePath: 'test.md' })
        );
    });

    it('should handle malformed JSON responses gracefully', async () => {
        const mockFile = { path: 'test.md', basename: 'test' } as TFile;
        mockLlmService.callLlm.mockResolvedValue('Not a JSON response');

        await extractor.extractFromNote(mockFile, 'content');

        expect(mockStorage.appendLine).not.toHaveBeenCalled();
    });
});
