import { describe, it, expect, vi, beforeEach } from 'vitest';
import SemanticGraphHealer from '../../src/main';

describe('CommandPalette', () => {
    let mockPlugin: any;
    let commands: Map<string, any>;

    beforeEach(() => {
        commands = new Map();
        mockPlugin = {
            addCommand: vi.fn().mockImplementation((cmd) => {
                commands.set(cmd.id, cmd);
            }),
            api: {
                executeBatch: vi.fn(),
                undoBatch: vi.fn(),
            },
            cache: {
                history: [],
            },
            logger: {
                error: vi.fn(),
            },
            activateDashboard: vi.fn(),
            activateGraphView: vi.fn(),
        };

        // Call the method from SemanticGraphHealer prototype bound to mockPlugin
        const registerCommands = (SemanticGraphHealer.prototype as any).registerCommands;
        registerCommands.call(mockPlugin);
    });

    it('should register batch and undo commands', () => {
        expect(commands.has('apply-batch-repairs-high-confidence')).toBe(true);
        expect(commands.has('undo-last-batch-repair')).toBe(true);
    });

    describe('apply-batch-repairs-high-confidence', () => {
        it('should call api.executeBatch with 0.8 confidence', async () => {
            mockPlugin.api.executeBatch.mockResolvedValue({ appliedCount: 1, failedCount: 0, batchId: 'b1' });
            const cmd = commands.get('apply-batch-repairs-high-confidence')!;
            await cmd.callback();
            expect(mockPlugin.api.executeBatch).toHaveBeenCalledWith({ confidence: 0.8 });
        });
    });

    describe('undo-last-batch-repair', () => {
        it('should call api.undoBatch with the last batchId from history', async () => {
            mockPlugin.cache.history = [
                { id: '1', batchId: 'batch-old' },
                { id: '2' }, // non-batch item
                { id: '3', batchId: 'batch-latest' },
            ];
            mockPlugin.api.undoBatch.mockResolvedValue({ revertedCount: 1, failedCount: 0 });

            const cmd = commands.get('undo-last-batch-repair')!;
            await cmd.callback();

            expect(mockPlugin.api.undoBatch).toHaveBeenCalledWith('batch-latest');
        });

        it('should show notice if no batch repairs in history', async () => {
            mockPlugin.cache.history = [{ id: '1' }];
            const cmd = commands.get('undo-last-batch-repair')!;
            await cmd.callback();
            expect(mockPlugin.api.undoBatch).not.toHaveBeenCalled();
        });
    });
});
