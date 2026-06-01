import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutomationApi } from '../../../src/core/services/AutomationApi';
import type { Suggestion } from '../../../src/types';

describe('AutomationApi Audit', () => {
    let mockContext: any;

    beforeEach(() => {
        mockContext = {
            executor: {
                getNotifier: vi.fn().mockReturnValue({ show: vi.fn() }),
                setNotifier: vi.fn(),
                execute: vi.fn().mockResolvedValue(true),
                undo: vi.fn().mockResolvedValue(true),
            },
            cache: {
                suggestions: [],
                history: [],
                save: vi.fn(),
            },
            settings: {
                lastScanTimestamp: Date.now(),
            },
            analyzeGraph: vi.fn().mockResolvedValue(undefined),
        };
    });

    describe('executeBatch - Category/Type Bug', () => {
        it('should correctly filter suggestions by type when requested via category option', async () => {
            mockContext.cache.suggestions = [
                { id: '1', type: 'ai', category: 'suggestion', meta: { confidence: 90 } },
                { id: '2', type: 'deterministic', category: 'suggestion', meta: { confidence: 90 } },
                { id: '3', type: 'quality', category: 'error', meta: { confidence: 90 } },
            ] as any[];

            const api = new AutomationApi(mockContext);

            // If we filter by category 'ai', it should match suggestion with type 'ai'
            // In the current buggy implementation, it checks s.category === 'ai', which is false for all.
            const result = await api.executeBatch({ confidence: 0.8, category: 'ai' });

            expect(result.appliedCount).toBe(1);
            expect(mockContext.executor.execute).toHaveBeenCalledTimes(1);
        });

        it('should still filter by s.category if it matches', async () => {
            mockContext.cache.suggestions = [
                { id: '1', type: 'ai', category: 'suggestion', meta: { confidence: 90 } },
                { id: '2', type: 'deterministic', category: 'suggestion', meta: { confidence: 90 } },
                { id: '3', type: 'quality', category: 'error', meta: { confidence: 90 } },
            ] as any[];

            const api = new AutomationApi(mockContext);

            const result = await api.executeBatch({ confidence: 0.8, category: 'error' });

            expect(result.appliedCount).toBe(1);
            expect(mockContext.executor.execute).toHaveBeenCalledTimes(1);
        });
    });

    describe('runAnalysis - Failure propagation', () => {
        it('should throw an error if analyzeGraph fails internally', async () => {
            mockContext.cache.suggestions = [{ id: 'old' }];
            // analyzeGraph now returns boolean
            mockContext.analyzeGraph.mockResolvedValue(false);

            const api = new AutomationApi(mockContext);
            await expect(api.runAnalysis({ silent: true })).rejects.toThrow('Graph analysis failed or was aborted.');
        });
    });
});
