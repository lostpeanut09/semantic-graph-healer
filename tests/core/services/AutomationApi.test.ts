import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AutomationApi } from '../../../src/core/services/AutomationApi';
import type { HealerNotifier, Suggestion } from '../../../src/types';

describe('AutomationApi', () => {
    let mockNotifier: HealerNotifier;
    let mockContext: any;
    let consoleInfoSpy: any;

    beforeEach(() => {
        mockNotifier = {
            show: vi.fn(),
        };

        mockContext = {
            executor: {
                getNotifier: vi.fn().mockReturnValue(mockNotifier),
                setNotifier: vi.fn(),
            },
            cache: {
                suggestions: [],
                topologicalScores: {
                    pageRank: { nodeA: 1.0 },
                    betweenness: {},
                    communities: {},
                },
            },
            settings: {
                lastScanTimestamp: 12345,
            },
            analyzeGraph: vi.fn().mockResolvedValue(undefined),
        };

        consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should use SilentNotifier when silent is true', async () => {
        const api = new AutomationApi(mockContext);

        await api.runAnalysis({ silent: true });

        expect(mockContext.executor.getNotifier).toHaveBeenCalled();
        expect(mockContext.executor.setNotifier).toHaveBeenCalledTimes(2);

        // First call should be setting the SilentNotifier
        const silentNotifier = mockContext.executor.setNotifier.mock.calls[0][0];
        expect(silentNotifier).toBeDefined();

        // Verify it logs to console instead of throwing/using UI
        silentNotifier.show('Test message', 'info');
        expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('[SilentNotifier][info] Test message'));

        // Should restore the original notifier
        expect(mockContext.executor.setNotifier.mock.calls[1][0]).toBe(mockNotifier);

        expect(mockContext.analyzeGraph).toHaveBeenCalledWith(true);
    });

    it('should NOT use SilentNotifier when silent is false', async () => {
        const api = new AutomationApi(mockContext);

        await api.runAnalysis({ silent: false });

        expect(mockContext.executor.getNotifier).toHaveBeenCalled();
        expect(mockContext.executor.setNotifier).not.toHaveBeenCalled();
        expect(mockContext.analyzeGraph).toHaveBeenCalledWith(false);
    });

    it('should properly shallow clone suggestions for JSON output', () => {
        const api = new AutomationApi(mockContext);

        const mockSuggestion: Suggestion = {
            id: '1',
            type: 'deterministic',
            category: 'suggestion',
            link: '[[Test]]',
            source: 'test-source',
            timestamp: 1000,
            meta: { property: 'up' },
            // Add a cyclic or deep object that we want to ensure isn't deep cloned deeply but metadata is cloned
        };

        mockContext.cache.suggestions.push(mockSuggestion);

        const suggestions = api.getSuggestions();
        expect(suggestions).toHaveLength(1);
        const cloned = suggestions[0];

        expect(cloned.id).toBe('1');
        expect(cloned.meta).toEqual({ property: 'up' });

        // Ensure it's a new object reference for meta
        expect(cloned.meta).not.toBe(mockSuggestion.meta);
    });

    it('should return metrics correctly', () => {
        const api = new AutomationApi(mockContext);

        const metrics = api.getMetrics();
        expect(metrics).not.toBeNull();
        expect(metrics?.pageRank).toEqual({ nodeA: 1.0 });
        expect(metrics?.lastAnalysisTimestamp).toBe(12345);
    });
});
