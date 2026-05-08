import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinkPredictionEngine } from '../../src/core/LinkPredictionEngine';
import { SmartConnectionsAdapter } from '../../src/core/adapters/SmartConnectionsAdapter';
import { TFile } from 'obsidian';

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

describe('LinkPredictionEngine', () => {
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
                htrStructuralWeight: 0.6,
            },
            graphWorkerService: {
                runAnalysis: vi.fn(),
            },
        };
        engine = new LinkPredictionEngine(mockContext);

        mockIsAvailable.mockReset().mockReturnValue(true);
        mockGetRelatedNotes.mockReset().mockResolvedValue([]);
    });

    it('should synthesize suggestions from worker results without SmartConnections', async () => {
        mockContext.settings.enableSmartConnections = false;
        const mockNodes = [
            { key: 'A', attributes: {} },
            { key: 'B', attributes: {} },
        ];
        const workerResults = [{ source: 'A', target: 'B', score: 0.85 }];

        mockContext.graphWorkerService.runAnalysis.mockResolvedValue(workerResults);
        mockContext.app.vault.getAbstractFileByPath.mockImplementation((path: string) => {
            const f = new TFile();
            (f as any).path = path;
            (f as any).basename = path;
            return f;
        });

        const suggestions = await engine.predictLinks(mockNodes, []);

        expect(suggestions).toHaveLength(1);
        expect(suggestions[0].id).toBe('predicted_link:A:B');
        expect(suggestions[0].meta?.confidence).toBe(85);
    });

    it('should calculate HTR score correctly using htrStructuralWeight', async () => {
        const mockNodes = [
            { key: 'A', attributes: {} },
            { key: 'B', attributes: {} },
        ];
        const workerResults = [{ source: 'A', target: 'B', score: 0.8 }]; // structural

        mockContext.graphWorkerService.runAnalysis.mockResolvedValue(workerResults);
        mockContext.app.vault.getAbstractFileByPath.mockImplementation((path: string) => {
            const f = new TFile();
            (f as any).path = path;
            (f as any).basename = path;
            return f;
        });

        mockGetRelatedNotes.mockResolvedValue([{ path: 'B', score: 0.6 }]); // semantic

        const suggestions = await engine.predictLinks(mockNodes, []);

        expect(suggestions).toHaveLength(1);

        // struct=0.8, sem=0.6, weight=0.6 => 0.8*0.6 + 0.6*0.4 = 0.48 + 0.24 = 0.72 -> 72%
        expect(suggestions[0].meta?.confidence).toBe(72);
        expect(mockGetRelatedNotes).toHaveBeenCalledWith('A', expect.any(Number));
    });

    it('should normalize scores before merging', async () => {
        const mockNodes = [
            { key: 'A', attributes: {} },
            { key: 'B', attributes: {} },
        ];
        // Structural comes back 1-100 scale here
        const workerResults = [{ source: 'A', target: 'B', score: 80 }];

        mockContext.graphWorkerService.runAnalysis.mockResolvedValue(workerResults);
        mockContext.app.vault.getAbstractFileByPath.mockImplementation((path: string) => {
            const f = new TFile();
            (f as any).path = path;
            (f as any).basename = path;
            return f;
        });

        mockGetRelatedNotes.mockResolvedValue([{ path: 'B', score: 60 }]); // Semantic 1-100 scale

        const suggestions = await engine.predictLinks(mockNodes, []);

        // Both 80 and 60 are > 1, so they should be normalized to 0.8 and 0.6.
        // HTR = 0.8*0.6 + 0.6*0.4 = 0.72 => 72
        expect(suggestions[0].meta?.confidence).toBe(72);
    });
});
