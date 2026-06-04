import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('HealerLogger Rate Limit', () => {
    const mockPlugin = {
        app: {
            vault: {
                getAbstractFileByPath: vi.fn(),
                create: vi.fn(),
            },
        },
    } as unknown as Plugin;

    beforeEach(() => {
        vi.useRealTimers();
    });

    it('test_perModuleCap_blocksAtCap', () => {
        const logger = new HealerLogger('NoisyMod', mockPlugin, baseSettings());

        for (let i = 0; i < 11; i++) {
            logger.info(`unique msg ${i}`);
        }

        const buffer = (logger as any).logBuffer as Array<unknown>;
        expect(buffer.length).toBe(10);
    });

    it('test_perModuleCap_doesNotBlockOtherModules', () => {
        const loggerA = new HealerLogger('ModA', mockPlugin, baseSettings());
        const loggerB = new HealerLogger('ModB', mockPlugin, baseSettings());

        for (let i = 0; i < 11; i++) loggerA.info(`a-${i}`);
        for (let i = 0; i < 11; i++) loggerB.info(`b-${i}`);

        const bufA = (loggerA as any).logBuffer as Array<unknown>;
        const bufB = (loggerB as any).logBuffer as Array<unknown>;
        expect(bufA.length).toBe(10);
        expect(bufB.length).toBe(10);
    });

    it('test_globalCap_blocksAtCap', () => {
        const settings = baseSettings();
        settings.logPerModuleCap = 0; // disable per-module cap so global cap is the only gate
        const logger = new HealerLogger('MixedMod', mockPlugin, settings);

        for (let i = 0; i < 101; i++) {
            logger.info(`msg ${i}`);
        }

        const buffer = (logger as any).logBuffer as Array<unknown>;
        expect(buffer.length).toBe(100);
    });

    it('test_setDedupConfig_updatesLive', () => {
        vi.useFakeTimers();
        const start = Date.now();
        vi.setSystemTime(start);

        const logger = new HealerLogger('LiveMod', mockPlugin, baseSettings());

        for (let i = 0; i < 5; i++) logger.info(`init-${i}`);
        expect(((logger as any).logBuffer as Array<unknown>).length).toBe(5);

        vi.setSystemTime(start + 6000);

        logger.setDedupConfig({ perModuleCap: 2 });
        for (let i = 0; i < 5; i++) logger.info(`after-${i}`);

        vi.useRealTimers();

        const buffer = (logger as any).logBuffer as Array<unknown>;
        expect(buffer.length).toBe(7);
    });
});
