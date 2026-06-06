import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Plugin } from 'obsidian';
import { HealerLogger } from '../../../src/core/utils/HealerLogger';
import type { SemanticGraphHealerSettings } from '../../../src/types';

const baseSettings = (): SemanticGraphHealerSettings =>
    ({
        logLevel: 'debug',
        logDedupWindowMs: 5000,
        logPerModuleCap: 10,
        logGlobalCap: 100,
    }) as unknown as SemanticGraphHealerSettings;

const mockPlugin = {
    app: {
        vault: {
            getAbstractFileByPath: vi.fn(),
            create: vi.fn(),
        },
    },
} as unknown as Plugin;

describe('HealerLogger Singleton (D-07, T-25-03-03)', () => {
    afterEach(() => {
        // Reset the singleton between tests so no cross-contamination
        (HealerLogger as unknown as { _singletonInstance: HealerLogger | null })._singletonInstance = null;
    });

    describe('G3 — Static singleton delegation (D-07)', () => {
        it('HealerLogger.warn delegates to registered singleton instance.warn', () => {
            const instance = new HealerLogger('TestMod', mockPlugin, baseSettings());
            const warnSpy = vi.spyOn(instance, 'warn');

            HealerLogger.setInstance(instance);
            HealerLogger.warn('delegated warn message', { extra: 1 });

            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(warnSpy).toHaveBeenCalledWith('delegated warn message', {
                extra: 1,
            });
        });

        it('HealerLogger.info delegates to registered singleton instance.info', () => {
            const instance = new HealerLogger('TestMod', mockPlugin, baseSettings());
            const infoSpy = vi.spyOn(instance, 'info');

            HealerLogger.setInstance(instance);
            HealerLogger.info('delegated info message');

            expect(infoSpy).toHaveBeenCalledTimes(1);
            expect(infoSpy).toHaveBeenCalledWith('delegated info message');
        });

        it('HealerLogger.error delegates to registered singleton instance.error', () => {
            const instance = new HealerLogger('TestMod', mockPlugin, baseSettings());
            const errorSpy = vi.spyOn(instance, 'error');

            HealerLogger.setInstance(instance);
            const cause = new Error('boom');
            HealerLogger.error('delegated error message', cause);

            expect(errorSpy).toHaveBeenCalledTimes(1);
            expect(errorSpy).toHaveBeenCalledWith('delegated error message', cause);
        });

        it('HealerLogger.debug delegates to registered singleton instance.debug', () => {
            const instance = new HealerLogger('TestMod', mockPlugin, baseSettings());
            const debugSpy = vi.spyOn(instance, 'debug');

            HealerLogger.setInstance(instance);
            HealerLogger.debug('delegated debug message');

            expect(debugSpy).toHaveBeenCalledTimes(1);
            expect(debugSpy).toHaveBeenCalledWith('delegated debug message');
        });

        it('static calls route through instance dedup/rate-limit pipeline', () => {
            const instance = new HealerLogger('TestMod', mockPlugin, baseSettings());
            HealerLogger.setInstance(instance);

            // Dedup: identical messages within window are collapsed
            HealerLogger.warn('duplicate me');
            HealerLogger.warn('duplicate me');
            HealerLogger.warn('duplicate me');

            const buffer = (instance as unknown as { logBuffer: Array<{ message: string }> }).logBuffer;
            expect(buffer.length).toBe(1);
        });
    });

    describe('G4 — Static console fallback (T-25-03-03)', () => {
        it('HealerLogger.warn falls back to console.warn when no singleton registered', () => {
            const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            HealerLogger.warn('pre-init warning');

            expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
            expect(consoleWarnSpy).toHaveBeenCalledWith('[SemanticHealer][WARN]', 'pre-init warning');

            consoleWarnSpy.mockRestore();
        });

        it('HealerLogger.info falls back to console.info when no singleton registered', () => {
            const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

            HealerLogger.info('pre-init info');

            expect(consoleInfoSpy).toHaveBeenCalledTimes(1);
            expect(consoleInfoSpy).toHaveBeenCalledWith('[SemanticHealer][INFO]', 'pre-init info');

            consoleInfoSpy.mockRestore();
        });

        it('HealerLogger.error falls back to console.error when no singleton registered', () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            HealerLogger.error('pre-init error');

            expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
            expect(consoleErrorSpy).toHaveBeenCalledWith('[SemanticHealer][ERROR]', 'pre-init error', undefined);

            consoleErrorSpy.mockRestore();
        });

        it('HealerLogger.error extracts Error details in console fallback path', () => {
            const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            const err = new Error('pre-init crash');

            HealerLogger.error('pre-init error with cause', err);

            expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
            const callArgs = consoleErrorSpy.mock.calls[0];
            expect(callArgs[0]).toBe('[SemanticHealer][ERROR]');
            expect(callArgs[1]).toBe('pre-init error with cause');
            const errorData = callArgs[2] as {
                message: string;
                stack: string;
                name: string;
            };
            expect(errorData.message).toBe('pre-init crash');
            expect(errorData.name).toBe('Error');
            expect(errorData.stack).toBeDefined();

            consoleErrorSpy.mockRestore();
        });

        it('HealerLogger.debug falls back to console.debug when no singleton registered', () => {
            const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

            HealerLogger.debug('pre-init debug');

            expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
            expect(consoleDebugSpy).toHaveBeenCalledWith('[SemanticHealer][DEBUG]', 'pre-init debug');

            consoleDebugSpy.mockRestore();
        });
    });
});
