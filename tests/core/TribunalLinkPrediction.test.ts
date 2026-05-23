import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LlmService } from '../../src/core/LlmService';
import { LinkPredictionEngine } from '../../src/core/LinkPredictionEngine';
import { SmartConnectionsAdapter } from '../../src/core/adapters/SmartConnectionsAdapter';
import { requestUrl, TFile } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../src/types';
import type { SemanticGraphHealerSettings } from '../../src/types';

vi.mock('obsidian', () => ({
    requestUrl: vi.fn(),
    TFile: class {
        path = '';
        basename = '';
        stat = { mtime: 0 };
    },
}));

const mockIsAvailable = vi.fn().mockReturnValue(true);
const mockGetRelatedNotes = vi.fn().mockResolvedValue([]);

vi.mock('../../src/core/adapters/SmartConnectionsAdapter', () => {
    return {
        SmartConnectionsAdapter: vi.fn().mockImplementation(function () {
            return {
                isAvailable: mockIsAvailable,
                getRelatedNotes: mockGetRelatedNotes,
            };
        }),
    };
});

describe('AI Tribunal & HTR Edge Cases Validation', () => {
    describe('LlmService - AI Tribunal Robustness', () => {
        let service: LlmService;
        let mockSettings: SemanticGraphHealerSettings;
        let mockGetKey: ReturnType<typeof vi.fn>;

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
            mockGetKey = vi.fn().mockResolvedValue('test-key');
            service = new LlmService(mockSettings, mockGetKey as any);
            vi.clearAllMocks();
        });

        it('should handle secondary model failure by falling back to primary result', async () => {
            // Primary succeeds with low confidence
            vi.mocked(requestUrl).mockResolvedValueOnce({
                status: 200,
                json: { choices: [{ message: { content: 'WINNER: A | SCORE: 70 | WHY: Low confidence' } }] },
            } as any);

            // Secondary fails
            vi.mocked(requestUrl).mockRejectedValueOnce(new Error('API Error'));

            const result = await service.callLlm('test prompt', true);

            // 1 primary + 1 initial secondary + 2 retries = 4
            expect(requestUrl).toHaveBeenCalledTimes(4);
            expect(result).toContain('Status: STABLE');
            expect(result).toContain('ConfidenceScore: 70');
            expect(result).toContain('PrimaryReasoning: Low confidence');
        });

        it('should handle UNCERTAIN status when winners cannot be parsed', async () => {
            // Primary malformed
            vi.mocked(requestUrl).mockResolvedValueOnce({
                status: 200,
                json: { choices: [{ message: { content: 'Garbage output' } }] },
            } as any);

            // Secondary also malformed
            vi.mocked(requestUrl).mockResolvedValueOnce({
                status: 200,
                json: { choices: [{ message: { content: 'More garbage' } }] },
            } as any);

            const result = await service.callLlm('test prompt', true);

            expect(result).toContain('Status: UNCERTAIN');
            expect(result).toContain('ConfidenceScore: 0');
        });

        it('should return primary result if secondary model is not configured', async () => {
            mockSettings.secondaryLlmModelName = '';

            vi.mocked(requestUrl).mockResolvedValueOnce({
                status: 200,
                json: { choices: [{ message: { content: 'WINNER: A | SCORE: 70 | WHY: Primary only' } }] },
            } as any);

            const result = await service.callLlm('test prompt', true);

            expect(requestUrl).toHaveBeenCalledTimes(1);
            expect(result).toContain('Status: STABLE');
            expect(result).toContain('ConfidenceScore: 70');
        });
    });

    describe('LinkPredictionEngine - HTR Normalization & Weights', () => {
        let engine: LinkPredictionEngine;
        let mockContext: any;

        beforeEach(() => {
            mockContext = {
                app: {
                    vault: {
                        getMarkdownFiles: vi.fn().mockReturnValue([]),
                        getAbstractFileByPath: vi.fn(),
                    },
                },
                settings: {
                    linkPredictionWeights: { jaccard: 0.5, adamicAdar: 0.5, resourceAllocation: 0 },
                    enableSmartConnections: true,
                    htrStructuralWeight: 0.8, // 80% structural priority
                },
                graphWorkerService: {
                    runAnalysis: vi.fn(),
                },
            };
            engine = new LinkPredictionEngine(mockContext);
            mockIsAvailable.mockReturnValue(true);
            mockGetRelatedNotes.mockResolvedValue([]);
        });

        it('should correctly weight HTR with extreme weights (1.0 structural)', async () => {
            mockContext.settings.htrStructuralWeight = 1.0;
            const mockNodes = [
                { key: 'A', attributes: {} },
                { key: 'B', attributes: {} },
            ];
            mockContext.graphWorkerService.runAnalysis.mockResolvedValue([{ source: 'A', target: 'B', score: 0.9 }]);

            mockGetRelatedNotes.mockResolvedValue([{ path: 'B', score: 0.1 }]); // Semantic very different

            mockContext.app.vault.getAbstractFileByPath.mockImplementation((path: string) => {
                const f = new TFile() as any;
                f.path = path;
                f.basename = path;
                return f;
            });

            const suggestions = await engine.predictLinks(mockNodes, []);
            expect(suggestions[0].meta?.confidence).toBe(90);
        });

        it('should correctly weight HTR with extreme weights (0.0 structural)', async () => {
            mockContext.settings.htrStructuralWeight = 0.0;
            const mockNodes = [
                { key: 'A', attributes: {} },
                { key: 'B', attributes: {} },
            ];
            mockContext.graphWorkerService.runAnalysis.mockResolvedValue([{ source: 'A', target: 'B', score: 0.9 }]); // Structural very high

            mockGetRelatedNotes.mockResolvedValue([{ path: 'B', score: 0.2 }]); // Semantic low

            mockContext.app.vault.getAbstractFileByPath.mockImplementation((path: string) => {
                const f = new TFile() as any;
                f.path = path;
                f.basename = path;
                return f;
            });

            const suggestions = await engine.predictLinks(mockNodes, []);
            expect(suggestions[0].meta?.confidence).toBe(20);
        });

        it('should handle Smart Connections being unavailable gracefully', async () => {
            mockIsAvailable.mockReturnValue(false);
            mockGetRelatedNotes.mockClear();
            const mockNodes = [
                { key: 'A', attributes: {} },
                { key: 'B', attributes: {} },
            ];
            mockContext.graphWorkerService.runAnalysis.mockResolvedValue([{ source: 'A', target: 'B', score: 0.75 }]);

            mockContext.app.vault.getAbstractFileByPath.mockImplementation((path: string) => {
                const f = new TFile() as any;
                f.path = path;
                f.basename = path;
                return f;
            });

            const suggestions = await engine.predictLinks(mockNodes, []);
            expect(suggestions[0].meta?.confidence).toBe(75);
            expect(mockGetRelatedNotes).not.toHaveBeenCalled();
        });

        it('should normalize mixed scales correctly (0.5 structural, 80 semantic)', async () => {
            const mockNodes = [
                { key: 'A', attributes: {} },
                { key: 'B', attributes: {} },
            ];
            mockContext.graphWorkerService.runAnalysis.mockResolvedValue([{ source: 'A', target: 'B', score: 0.5 }]);
            mockGetRelatedNotes.mockResolvedValue([{ path: 'B', score: 80 }]); // 1-100 scale
            mockContext.settings.htrStructuralWeight = 0.5;

            mockContext.app.vault.getAbstractFileByPath.mockImplementation((path: string) => {
                const f = new TFile() as any;
                f.path = path;
                f.basename = path;
                return f;
            });

            const suggestions = await engine.predictLinks(mockNodes, []);

            // struct=0.5, sem=0.8, weight=0.5 => 0.5*0.5 + 0.8*0.5 = 0.25 + 0.4 = 0.65 => 65
            expect(suggestions[0].meta?.confidence).toBe(65);
        });
    });
});
