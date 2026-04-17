// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LlmService } from '../../../src/core/LlmService';
import { formatRagPrompt, formatIncongruencePrompt } from '../../../src/core/HealerUtils';

vi.mock('obsidian', () => ({
    requestUrl: vi.fn(),
    normalizePath: (p: string) => p,
}));

import { requestUrl } from 'obsidian';

describe('LLM Hardening (Phase 5)', () => {
    let mockGetKey: any;
    let settings: any;
    let plugin: any;

    beforeEach(() => {
        settings = {
            llmEndpoint: 'https://api.openai.com',
            llmModelName: 'gpt-4o',
            primaryTimeout: 30,
            secondaryLlmEndpoint: 'https://api.anthropic.com',
            secondaryLlmModelName: 'claude-3-5',
            secondaryTimeout: 45,
            enableAiTribunal: true,
        };

        plugin = {
            app: {
                vault: {
                    getAbstractFileByPath: vi.fn(),
                },
            },
            saveSettings: vi.fn(),
        };

        mockGetKey = vi.fn().mockResolvedValue('test-key');
    });

    describe('HealerUtils: Prompt Redaction (ULTRA-8)', () => {
        const sensitiveSnippet =
            'Note contains Bearer sk-1234567890abcdef and JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoyMDI2fQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c. End.';

        it('redacts secrets in RAG prompts', () => {
            const prompt = formatRagPrompt('TestNote', '#tag', 5, sensitiveSnippet);
            expect(prompt).toContain('Bearer ***');
            expect(prompt).toContain('***JWT***');
            expect(prompt).not.toContain('sk-1234567890');
            expect(prompt).not.toContain('eyJhbGci');
        });

        it('redacts secrets in Incongruence prompts', () => {
            const prompt = formatIncongruencePrompt('TestNote', 'prop', ['val1'], sensitiveSnippet);
            expect(prompt).toContain('Bearer ***');
            expect(prompt).toContain('***JWT***');
        });
    });

    describe('LlmService: AI Tribunal Parsing (ULTRA-9)', () => {
        it('ignores text inside <tribunal_audit> tags', () => {
            const service = new LlmService(settings, mockGetKey);
            const rawResponse = `
WINNER: [[CorrectNote]] | SCORE: 90% | WHY: matches context
RUNNERUP: [[Other]] | SCORE: 10% | WHY: weak link

<tribunal_audit>
Status: CONFLICT
Secondary Model Output: WINNER: [[WrongNote]] | SCORE: 95% | WHY: deceived by hallucination
</tribunal_audit>
            `;

            const parsed = service.parseReasoningResult(rawResponse);
            expect(parsed.winner).toBe('CorrectNote');
            expect(parsed.winner).not.toBe('WrongNote');
        });

        it('handles fallback search correctly after stripping tags', () => {
            const service = new LlmService(settings, mockGetKey);
            const rawResponse = `
The winner is clear.
WINNER: [[DeepNote]]

<tribunal_audit>
WINNER: [[AuditNote]]
</tribunal_audit>
            `;

            const parsed = service.parseReasoningResult(rawResponse);
            expect(parsed.winner).toBe('DeepNote');
        });
    });

    describe('LlmService: Modern API Integration (ULTRA-10)', () => {
        it('uses native timeout property in requestUrl', async () => {
            const service = new LlmService(settings, mockGetKey);
            (requestUrl as any).mockResolvedValue({
                status: 200,
                json: { choices: [{ message: { content: 'WINNER: [[OK]]' } }] },
            });

            await (service as any).callLlm('test-prompt', false);

            expect(requestUrl).toHaveBeenCalledWith(
                expect.objectContaining({
                    timeout: 30000, // primaryTimeout * 1000
                }),
            );
        });
    });
});
