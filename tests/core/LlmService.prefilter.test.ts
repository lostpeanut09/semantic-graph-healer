import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LlmService } from '../../src/core/LlmService';
import { requestUrl } from 'obsidian';
import type { RequestUrlResponse } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../src/types';
import type { SemanticGraphHealerSettings } from '../../src/types';
import type { ApiKeyType } from '../../src/core/HealerUtils';

vi.mock('obsidian', () => ({
    requestUrl: vi.fn(),
}));

describe('LlmService - AI Tribunal Stage 0 Pre-filter', () => {
    let service: LlmService;
    let mockSettings: SemanticGraphHealerSettings;
    let mockGetKey: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockSettings = {
            ...DEFAULT_SETTINGS,
            enableAiTribunal: true,
            safeZoneThreshold: 80,
            llmEndpoint: 'https://api.openai.com/v1',
            llmModelName: 'test-model',
        };
        mockGetKey = vi.fn().mockResolvedValue('test-key');
        service = new LlmService(mockSettings, mockGetKey as unknown as (type: ApiKeyType) => Promise<string>);
        vi.clearAllMocks();
    });

    it('should fast-fail if cosine similarity is below 0.4', async () => {
        // v1 and v2 are orthogonal
        const embeddings = {
            source: [1, 0, 0],
            target: [0, 1, 0],
        };

        const result = await service.callLlm('test prompt', true, undefined, embeddings);

        expect(requestUrl).not.toHaveBeenCalled();
        expect(result).toContain('Status: REJECTED');
        expect(result).toContain('ConfidenceScore: 0');
        expect(result).toContain('PrimaryReasoning: SEMANTIC_UNRELATED');

        const parsed = service.parseReasoningResult(result);
        expect(parsed.verdict).toBe('REJECTED');
        expect(parsed.winnerScore).toBe(0);
        expect(parsed.primaryReasoning).toBe('SEMANTIC_UNRELATED');
    });

    it('should NOT fast-fail if cosine similarity is above 0.4', async () => {
        // v1 and v2 are identical
        const embeddings = {
            source: [1, 0, 0],
            target: [1, 0, 0],
        };

        vi.mocked(requestUrl).mockResolvedValueOnce({
            status: 200,
            json: {
                choices: [{ message: { content: 'WINNER: A | SCORE: 90 | WHY: Match' } }],
            },
        } as unknown as RequestUrlResponse);

        const result = await service.callLlm('test prompt', true, undefined, embeddings);

        expect(requestUrl).toHaveBeenCalledTimes(1);
        expect(result).toContain('Status: STABLE');
        expect(result).toContain('ConfidenceScore: 90');
    });

    it('should skip pre-filter if useTribunal is false', async () => {
        const embeddings = {
            source: [1, 0, 0],
            target: [0, 1, 0],
        };

        vi.mocked(requestUrl).mockResolvedValueOnce({
            status: 200,
            json: {
                choices: [{ message: { content: 'Query Result' } }],
            },
        } as unknown as RequestUrlResponse);

        const result = await service.callLlm('test prompt', false, undefined, embeddings);

        expect(requestUrl).toHaveBeenCalledTimes(1);
        expect(result).toBe('Query Result');
    });

    it('should skip pre-filter if enableAiTribunal setting is false', async () => {
        mockSettings.enableAiTribunal = false;
        const embeddings = {
            source: [1, 0, 0],
            target: [0, 1, 0],
        };

        vi.mocked(requestUrl).mockResolvedValueOnce({
            status: 200,
            json: {
                choices: [{ message: { content: 'Query Result' } }],
            },
        } as unknown as RequestUrlResponse);

        const result = await service.callLlm('test prompt', true, undefined, embeddings);

        expect(requestUrl).toHaveBeenCalledTimes(1);
        expect(result).toBe('Query Result');
    });
});
