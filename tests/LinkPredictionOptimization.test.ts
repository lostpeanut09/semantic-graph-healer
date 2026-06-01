import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinkPredictionEngine } from '../src/core/LinkPredictionEngine';
import { SmartConnectionsAdapter } from '../src/core/adapters/SmartConnectionsAdapter';
import { TFile } from 'obsidian';

vi.mock('obsidian', () => ({
    TFile: class {
        path = '';
        basename = '';
        stat = { mtime: 0 };
    },
}));

const mockIsAvailable = vi.fn().mockReturnValue(true);
const mockGetRelatedNotes = vi.fn().mockResolvedValue([]);

vi.mock('../src/core/adapters/SmartConnectionsAdapter', () => {
    return {
        SmartConnectionsAdapter: vi.fn().mockImplementation(function () {
            return {
                isAvailable: mockIsAvailable,
                getRelatedNotes: mockGetRelatedNotes,
            };
        }),
    };
});

describe('LinkPredictionEngine Performance and Normalization', () => {
    let engine: LinkPredictionEngine;
    let mockContext: any;

    beforeEach(() => {
        mockContext = {
            app: {
                vault: {
                    getMarkdownFiles: vi.fn().mockReturnValue([]),
                    getAbstractFileByPath: vi.fn().mockImplementation((path: string) => {
                        const f = new TFile() as any;
                        f.path = path;
                        f.basename = path;
                        return f;
                    }),
                },
                metadataCache: {
                    getFirstLinkpathDest: vi.fn(),
                }
            },
            settings: {
                linkPredictionWeights: { jaccard: 1 },
                enableSmartConnections: true,
                htrStructuralWeight: 0.5,
            },
            graphWorkerService: {
                runAnalysis: vi.fn(),
            },
        };
        engine = new LinkPredictionEngine(mockContext);
        mockIsAvailable.mockReturnValue(true);
        mockGetRelatedNotes.mockResolvedValue([]);
        vi.clearAllMocks();
    });

    it('should NOT call getRelatedNotes redundantly for the same source', async () => {
        const mockNodes = [{ key: 'SourceA', attributes: {} }];
        // Two suggestions for the same source
        mockContext.graphWorkerService.runAnalysis.mockResolvedValue([
            { source: 'SourceA', target: 'Target1', score: 0.8 },
            { source: 'SourceA', target: 'Target2', score: 0.7 },
        ]);

        mockGetRelatedNotes.mockResolvedValue([
            { path: 'Target1', score: 0.9 },
            { path: 'Target2', score: 0.6 },
        ]);

        await engine.predictLinks(mockNodes, []);

        // HYPOTHESIS: If not optimized, this will be 2. If optimized, it will be 1.
        // Currently it is 2.
        expect(mockGetRelatedNotes).toHaveBeenCalledTimes(1);
    });

    it('should handle scores slightly above 1 correctly', async () => {
        const mockNodes = [{ key: 'SourceA', attributes: {} }];
        mockContext.graphWorkerService.runAnalysis.mockResolvedValue([
            { source: 'SourceA', target: 'Target1', score: 1.0001 }, // Slightly above 1
        ]);

        mockGetRelatedNotes.mockResolvedValue([
            { path: 'Target1', score: 0.8 },
        ]);

        const suggestions = await engine.predictLinks(mockNodes, []);
        
        // Current logic: 1.0001 > 1 ? 1.0001 / 100 : 1.0001 => 0.010001
        // finalScore = 0.010001 * 0.5 + 0.8 * 0.5 = 0.005 + 0.4 = 0.405
        // scaledScore = 0.405 * 100 = 40.5 => 41
        
        // Expected: 1.0001 should be treated as 1.0 or at least not divided by 100 if it's meant to be 0-1.
        // If it's 0-100 scale, 1.0001 is very low.
        
        // Let's see what it currently returns.
        expect(suggestions[0].meta?.confidence).toBeGreaterThan(50);
    });
});
