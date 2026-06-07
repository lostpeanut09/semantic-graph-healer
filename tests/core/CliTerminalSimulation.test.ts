import { describe, it, expect, vi, beforeEach } from 'vitest';
import SemanticGraphHealer from '../../src/main';

type MockPlugin = {
    registerCliHandler: ReturnType<typeof vi.fn>;
    api: {
        runAnalysis: ReturnType<typeof vi.fn>;
        getSuggestions: ReturnType<typeof vi.fn>;
        executeBatch: ReturnType<typeof vi.fn>;
        undoBatch: ReturnType<typeof vi.fn>;
    };
    logger: {
        info: ReturnType<typeof vi.fn>;
        error: ReturnType<typeof vi.fn>;
        debug: ReturnType<typeof vi.fn>;
    };
};

describe('CliTerminalSimulation', () => {
    let mockPlugin: MockPlugin;
    let cliHandlers: Map<
        string,
        {
            description: string;
            flags: unknown;
            callback: (params: unknown) => Promise<string | void> | string | void;
        }
    >;

    beforeEach(() => {
        cliHandlers = new Map();
        mockPlugin = {
            registerCliHandler: vi
                .fn()
                .mockImplementation(
                    (
                        name: string,
                        description: string,
                        flags: unknown,
                        callback: (params: unknown) => Promise<string | void> | string | void,
                    ) => {
                        cliHandlers.set(name, { description, flags, callback });
                    },
                ),
            api: {
                runAnalysis: vi.fn(),
                getSuggestions: vi.fn(),
                executeBatch: vi.fn(),
                undoBatch: vi.fn(),
            },
            logger: {
                info: vi.fn(),
                error: vi.fn(),
                debug: vi.fn(),
            },
        };

        // Call the method from SemanticGraphHealer prototype bound to mockPlugin
        const registerCliHandlers = (
            SemanticGraphHealer.prototype as unknown as {
                registerCliHandlers: () => void;
            }
        ).registerCliHandlers;
        registerCliHandlers.call(mockPlugin);
    });

    it('should register all expected CLI subcommands', () => {
        expect(mockPlugin.registerCliHandler).toHaveBeenCalledTimes(4);
        expect(cliHandlers.has('healer:scan')).toBe(true);
        expect(cliHandlers.has('healer:export-suggestions')).toBe(true);
        expect(cliHandlers.has('healer:apply-batch')).toBe(true);
        expect(cliHandlers.has('healer:undo-batch')).toBe(true);
    });

    describe('healer:scan', () => {
        it('should execute analyzeGraph silently by default and return stringified suggestions list', async () => {
            const mockSuggestions = [{ id: 's1', type: 'deterministic' }];
            mockPlugin.api.runAnalysis.mockResolvedValue(mockSuggestions);

            const handler = cliHandlers.get('healer:scan')!;
            const result = await handler.callback({ silent: true });

            expect(mockPlugin.api.runAnalysis).toHaveBeenCalledWith({ silent: true });
            expect(JSON.parse(result as string)).toEqual(mockSuggestions);
        });

        it('should parse silent parameter correctly when set to false', async () => {
            const mockSuggestions = [] as unknown[];
            mockPlugin.api.runAnalysis.mockResolvedValue(mockSuggestions);

            const handler = cliHandlers.get('healer:scan')!;
            await handler.callback({ silent: false });

            expect(mockPlugin.api.runAnalysis).toHaveBeenCalledWith({
                silent: false,
            });
        });

        it('should catch exceptions and output a stringified JSON error structure', async () => {
            mockPlugin.api.runAnalysis.mockRejectedValue(new Error('Vault read error'));

            const handler = cliHandlers.get('healer:scan')!;
            const result = await handler.callback({ silent: true });

            const parsed = JSON.parse(result as string);
            expect(parsed.status).toBe('error');
            expect(parsed.message).toBe('Vault read error');
        });
    });

    describe('healer:export-suggestions', () => {
        it('should return pure stringified suggestions array', async () => {
            const mockSuggestions = [
                { id: 's1', type: 'deterministic', link: '[[Node1]]' },
                { id: 's2', type: 'ai', link: '[[Node2]]' },
            ];
            mockPlugin.api.getSuggestions.mockReturnValue(mockSuggestions);

            const handler = cliHandlers.get('healer:export-suggestions')!;
            const result = await handler.callback(null);

            expect(mockPlugin.api.getSuggestions).toHaveBeenCalled();
            expect(JSON.parse(result as string)).toEqual(mockSuggestions);
        });

        it('should handle errors gracefully by returning a stringified JSON error structure', async () => {
            mockPlugin.api.getSuggestions.mockImplementation(() => {
                throw new Error('Database is locked');
            });

            const handler = cliHandlers.get('healer:export-suggestions')!;
            const result = await handler.callback(null);

            const parsed = JSON.parse(result as string);
            expect(parsed.status).toBe('error');
            expect(parsed.message).toBe('Database is locked');
        });
    });

    describe('healer:apply-batch', () => {
        it('should trigger batch execution with supplied threshold parameters and category', async () => {
            const expectedOutput = {
                success: true,
                batchId: 'batch-123',
                appliedCount: 5,
                failedCount: 0,
            };
            mockPlugin.api.executeBatch.mockResolvedValue(expectedOutput);

            const handler = cliHandlers.get('healer:apply-batch')!;
            const result = await handler.callback({
                confidence: 0.9,
                category: 'deterministic',
            });

            expect(mockPlugin.api.executeBatch).toHaveBeenCalledWith({
                confidence: 0.9,
                category: 'deterministic',
            });
            expect(JSON.parse(result as string)).toEqual(expectedOutput);
        });

        it('should default confidence threshold to 0.8 if missing or invalid', async () => {
            mockPlugin.api.executeBatch.mockResolvedValue({
                success: true,
                batchId: 'batch-123',
                appliedCount: 0,
                failedCount: 0,
            });

            const handler = cliHandlers.get('healer:apply-batch')!;
            await handler.callback(null);

            expect(mockPlugin.api.executeBatch).toHaveBeenCalledWith({
                confidence: 0.8,
                category: undefined,
            });
        });

        it('should return stringified JSON error structure if execution fails', async () => {
            mockPlugin.api.executeBatch.mockRejectedValue(new Error('Batch execution aborted due to concurrent lock'));

            const handler = cliHandlers.get('healer:apply-batch')!;
            const result = await handler.callback({ confidence: 0.8 });

            const parsed = JSON.parse(result as string);
            expect(parsed.status).toBe('error');
            expect(parsed.message).toBe('Batch execution aborted due to concurrent lock');
        });
    });

    describe('healer:undo-batch', () => {
        it('should trigger batch rollback for the specified batchId', async () => {
            const expectedOutput = {
                success: true,
                revertedCount: 3,
                failedCount: 0,
            };
            mockPlugin.api.undoBatch.mockResolvedValue(expectedOutput);

            const handler = cliHandlers.get('healer:undo-batch')!;
            const result = await handler.callback({ batchId: 'batch-abc' });

            expect(mockPlugin.api.undoBatch).toHaveBeenCalledWith('batch-abc');
            expect(JSON.parse(result as string)).toEqual(expectedOutput);
        });

        it('should return error stringified JSON if batchId is missing', async () => {
            const handler = cliHandlers.get('healer:undo-batch')!;
            const result = await handler.callback(null);

            const parsed = JSON.parse(result as string);
            expect(parsed.status).toBe('error');
            expect(parsed.message).toBe('Missing required flag: batchId');
        });

        it('should gracefully bubble errors as stringified JSON error structure', async () => {
            mockPlugin.api.undoBatch.mockRejectedValue(new Error('History item no longer exists in vault'));

            const handler = cliHandlers.get('healer:undo-batch')!;
            const result = await handler.callback({ batchId: 'batch-abc' });

            const parsed = JSON.parse(result as string);
            expect(parsed.status).toBe('error');
            expect(parsed.message).toBe('History item no longer exists in vault');
        });
    });
});
