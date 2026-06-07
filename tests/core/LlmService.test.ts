import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LlmService } from '../../src/core/LlmService';
import { requestUrl, type RequestUrlResponse } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../src/types';
import type { SemanticGraphHealerSettings } from '../../src/types';
import type { ApiKeyType } from '../../src/core/HealerUtils';

vi.mock('obsidian', () => ({
    requestUrl: vi.fn(),
}));

describe('LlmService - AI Tribunal Logic', () => {
    let service: LlmService;
    let mockSettings: SemanticGraphHealerSettings;
    let mockGetKey: (type: ApiKeyType) => Promise<string>;

    beforeEach(() => {
        mockSettings = {
            ...DEFAULT_SETTINGS,
            enableAiTribunal: true,
            safeZoneThreshold: 80,
            llmModelName: 'primary',
            secondaryLlmModelName: 'secondary',
            llmEndpoint: 'https://api.openai.com/v1',
            secondaryLlmEndpoint: 'https://api.anthropic.com/v1',
        };
        mockGetKey = vi.fn().mockResolvedValue('test-key') as unknown as (type: ApiKeyType) => Promise<string>;
        service = new LlmService(mockSettings, mockGetKey);
        vi.clearAllMocks();
    });

    it('should NOT call secondary model if primary confidence >= safeZoneThreshold', async () => {
        vi.mocked(requestUrl).mockResolvedValueOnce({
            status: 200,
            json: {
                choices: [{ message: { content: 'WINNER: A | SCORE: 85 | WHY: Good' } }],
            },
        } as unknown as RequestUrlResponse);

        const result = await service.callLlm('test prompt', true);

        expect(requestUrl).toHaveBeenCalledTimes(1);
        expect(result).toContain('Status: STABLE');
        expect(result).toContain('ConfidenceScore: 85');
    });

    it('should call secondary model if primary confidence < safeZoneThreshold', async () => {
        // Primary
        vi.mocked(requestUrl).mockResolvedValueOnce({
            status: 200,
            json: {
                choices: [{ message: { content: 'WINNER: A | SCORE: 70 | WHY: Okay' } }],
            },
        } as unknown as RequestUrlResponse);

        // Secondary
        vi.mocked(requestUrl).mockResolvedValueOnce({
            status: 200,
            json: {
                choices: [{ message: { content: 'WINNER: A | SCORE: 90 | WHY: Better' } }],
            },
        } as unknown as RequestUrlResponse);

        const result = await service.callLlm('test prompt', true);

        expect(requestUrl).toHaveBeenCalledTimes(2);
        expect(result).toContain('Status: STABLE');
        expect(result).toContain('ConfidenceScore: 90');
    });

    it('should result in CONFLICT when primary and secondary disagree', async () => {
        // Primary
        vi.mocked(requestUrl).mockResolvedValueOnce({
            status: 200,
            json: {
                choices: [{ message: { content: 'WINNER: A | SCORE: 70 | WHY: A is good' } }],
            },
        } as unknown as RequestUrlResponse);

        // Secondary
        vi.mocked(requestUrl).mockResolvedValueOnce({
            status: 200,
            json: {
                choices: [{ message: { content: 'WINNER: B | SCORE: 80 | WHY: B is better' } }],
            },
        } as unknown as RequestUrlResponse);

        const result = await service.callLlm('test prompt', true);

        expect(requestUrl).toHaveBeenCalledTimes(2);
        expect(result).toContain('Status: CONFLICT');
        expect(result).toContain('ConfidenceScore: 75'); // floor((70+80)/2)
        expect(result).toContain('PrimaryReasoning: A is good');
        expect(result).toContain('SecondaryReasoning: B is better');

        const parsed = service.parseReasoningResult(result);
        expect(parsed.verdict).toBe('CONFLICT');
        expect(parsed.confidenceScore).toBe(75);
        expect(parsed.primaryReasoning).toBe('A is good');
        expect(parsed.secondaryReasoning).toBe('B is better');
    });

    describe('validateTagInheritance', () => {
        it('should return true if LLM responds YES', async () => {
            vi.mocked(requestUrl).mockResolvedValueOnce({
                status: 200,
                json: {
                    choices: [{ message: { content: 'YES' } }],
                },
            } as unknown as RequestUrlResponse);

            const result = await service.validateTagInheritance('Child', 'tag', 'Parent');
            expect(result).toBe(true);
        });

        it('should return false if LLM responds NO', async () => {
            vi.mocked(requestUrl).mockResolvedValueOnce({
                status: 200,
                json: {
                    choices: [{ message: { content: 'NO' } }],
                },
            } as unknown as RequestUrlResponse);

            const result = await service.validateTagInheritance('Child', 'tag', 'Parent');
            expect(result).toBe(false);
        });

        it('should use cache for subsequent calls', async () => {
            vi.mocked(requestUrl).mockResolvedValueOnce({
                status: 200,
                json: {
                    choices: [{ message: { content: 'YES' } }],
                },
            } as unknown as RequestUrlResponse);

            await service.validateTagInheritance('Child', 'tag', 'Parent');
            const result = await service.validateTagInheritance('Child', 'tag', 'Parent');

            expect(requestUrl).toHaveBeenCalledTimes(1);
            expect(result).toBe(true);
        });
    });
});
