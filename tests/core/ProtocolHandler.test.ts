import { describe, it, expect, vi, beforeEach } from 'vitest';
import SemanticGraphHealer from '../../src/main';

describe('ProtocolHandler', () => {
    let mockPlugin: any;
    let protocolHandlers: Map<string, (params: any) => Promise<void> | void>;

    beforeEach(() => {
        protocolHandlers = new Map();
        mockPlugin = {
            registerObsidianProtocolHandler: vi.fn().mockImplementation((name, callback) => {
                protocolHandlers.set(name, callback);
            }),
            api: {
                executeBatch: vi.fn(),
                undoBatch: vi.fn(),
            },
            analyzeGraph: vi.fn(),
            logger: {
                error: vi.fn(),
            },
        };

        // Call the method from SemanticGraphHealer prototype bound to mockPlugin
        const registerProtocolHandlers = (SemanticGraphHealer.prototype as any).registerProtocolHandlers;
        registerProtocolHandlers.call(mockPlugin);
    });

    it('should register healer and healer-action protocols', () => {
        expect(mockPlugin.registerObsidianProtocolHandler).toHaveBeenCalledWith('healer', expect.any(Function));
        expect(mockPlugin.registerObsidianProtocolHandler).toHaveBeenCalledWith('healer-action', expect.any(Function));
    });

    describe('healer-action: scan', () => {
        it('should trigger analyzeGraph with silent=true', async () => {
            const handler = protocolHandlers.get('healer-action')!;
            await handler({ action: 'scan' });
            expect(mockPlugin.analyzeGraph).toHaveBeenCalledWith(true);
        });
    });

    describe('healer-action: apply-batch', () => {
        it('should trigger executeBatch with default confidence', async () => {
            mockPlugin.api.executeBatch.mockResolvedValue({ appliedCount: 5, failedCount: 0, batchId: 'b1' });
            const handler = protocolHandlers.get('healer-action')!;
            await handler({ action: 'apply-batch' });
            expect(mockPlugin.api.executeBatch).toHaveBeenCalledWith({ confidence: 0.8, category: undefined });
        });

        it('should pass custom confidence and category', async () => {
            mockPlugin.api.executeBatch.mockResolvedValue({ appliedCount: 2, failedCount: 0, batchId: 'b2' });
            const handler = protocolHandlers.get('healer-action')!;
            await handler({ action: 'apply-batch', confidence: '0.95', category: 'ai' });
            expect(mockPlugin.api.executeBatch).toHaveBeenCalledWith({ confidence: 0.95, category: 'ai' });
        });
    });

    describe('healer-action: undo-batch', () => {
        it('should trigger undoBatch with specified batchId', async () => {
            mockPlugin.api.undoBatch.mockResolvedValue({ revertedCount: 3, failedCount: 0 });
            const handler = protocolHandlers.get('healer-action')!;
            await handler({ action: 'undo-batch', batchId: 'batch-123' });
            expect(mockPlugin.api.undoBatch).toHaveBeenCalledWith('batch-123');
        });

        it('should handle missing batchId gracefully', async () => {
            const handler = protocolHandlers.get('healer-action')!;
            await handler({ action: 'undo-batch' });
            expect(mockPlugin.api.undoBatch).not.toHaveBeenCalled();
        });
    });
});
