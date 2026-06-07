import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutomationApi, type AutomationPluginContext } from '../../../src/core/services/AutomationApi';
import type { Suggestion, HistoryItem } from '../../../src/types';

describe('AutomationBatch', () => {
    let mockContext: AutomationPluginContext;

    beforeEach(() => {
        mockContext = {
            executor: {
                getNotifier: vi.fn().mockReturnValue({ show: vi.fn() }),
                setNotifier: vi.fn(),
                execute: vi.fn().mockResolvedValue(true),
                undo: vi.fn().mockResolvedValue(true),
                activeBatchId: undefined,
            },
            cache: {
                suggestions: [] as Suggestion[],
                history: [] as HistoryItem[],
                save: vi.fn(),
            },
            settings: {
                lastScanTimestamp: 12345,
            },
            analyzeGraph: vi.fn().mockResolvedValue(true),
        };
    });

    it('should correctly filter suggestions and execute batch repairs with UUID tagging', async () => {
        const api = new AutomationApi(mockContext);

        // Prepare suggestions with different confidence scores
        const suggestion1: Suggestion = {
            id: 's1',
            type: 'deterministic',
            category: 'suggestion',
            link: '[[Node1]]',
            source: 'src1',
            timestamp: 1000,
            meta: { confidence: 95 },
        };

        const suggestion2: Suggestion = {
            id: 's2',
            type: 'deterministic',
            category: 'suggestion',
            link: '[[Node2]]',
            source: 'src2',
            timestamp: 1000,
            meta: { confidence: 50 },
        };

        mockContext.cache.suggestions = [suggestion1, suggestion2];

        // Let's intercept executor.execute to check activeBatchId during execution
        const executeMock = mockContext.executor.execute as unknown as ReturnType<typeof vi.fn>;
        executeMock.mockImplementation(
            (s: Suggestion) => {
                expect(mockContext.executor.activeBatchId).toBeDefined();
                expect(mockContext.executor.activeBatchId).toMatch(
                    /^batch_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
                );
                return true;
            },
        );

        // Run batch with confidence gate of 90%
        const result = await api.executeBatch({ confidence: 0.9 });

        expect(result.success).toBe(true);
        expect(result.batchId).toBeDefined();
        expect(result.appliedCount).toBe(1);
        expect(result.failedCount).toBe(0);

        // Only suggestion1 (95%) should have been executed
        expect(mockContext.executor.execute).toHaveBeenCalledTimes(1);
        expect(mockContext.executor.execute).toHaveBeenCalledWith(suggestion1);

        // activeBatchId should have been reset in finally block
        expect(mockContext.executor.activeBatchId).toBeUndefined();
    });

    it('should rollback batch operations in reverse-chronological order and save cache', async () => {
        const api = new AutomationApi(mockContext);

        const batchId = 'test-batch-123';

        // Prepare history items
        const history1: HistoryItem = {
            timestamp: 1000,
            action: 'Fix 1',
            file: 'file1.md',
            type: 'fix',
            batchId,
            mementoData: [{ path: 'file1.md', property: 'prop', originalValue: 'old1' }],
        };

        const history2: HistoryItem = {
            timestamp: 1100,
            action: 'Fix 2',
            file: 'file2.md',
            type: 'fix',
            batchId,
            mementoData: [{ path: 'file2.md', property: 'prop', originalValue: 'old2' }],
        };

        // Note: history contains another item with different batchId
        const historyOther: HistoryItem = {
            timestamp: 1200,
            action: 'Fix other',
            file: 'fileOther.md',
            type: 'fix',
            batchId: 'other-batch',
            mementoData: [],
        };

        mockContext.cache.history = [history1, history2, historyOther];

        mockContext.executor.undo = vi.fn().mockResolvedValue(true);

        const rollbackResult = await api.undoBatch(batchId);

        expect(rollbackResult.success).toBe(true);
        expect(rollbackResult.revertedCount).toBe(2);
        expect(rollbackResult.failedCount).toBe(0);

        // Reverted in reverse order (history2 then history1)
        const undoMock = mockContext.executor.undo as unknown as ReturnType<typeof vi.fn>;
        const undoFirstArg = undoMock.mock.calls[0][0] as { action: string };
        const undoSecondArg = undoMock.mock.calls[1][0] as { action: string };
        expect(undoFirstArg.action).toBe('Fix 2');
        expect(undoSecondArg.action).toBe('Fix 1');

        // The reverted items should have been removed from history
        expect(mockContext.cache.history).toHaveLength(1);
        expect(mockContext.cache.history[0]).toBe(historyOther);

        // Cache save should have been called
        expect(mockContext.cache.save).toHaveBeenCalledTimes(1);
    });

    it('should return failure if undo batch id is not found', async () => {
        const api = new AutomationApi(mockContext);
        const rollbackResult = await api.undoBatch('non-existent');
        expect(rollbackResult.success).toBe(false);
        expect(rollbackResult.revertedCount).toBe(0);
    });
});
