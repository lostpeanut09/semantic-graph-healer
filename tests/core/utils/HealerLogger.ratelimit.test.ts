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

describe('G6 — Bolt rule stress test: pruning with 200+ entries', () => {
    const mockPlugin = {
        app: {
            vault: {
                getAbstractFileByPath: vi.fn(),
                create: vi.fn(),
            },
        },
    } as unknown as Plugin;

    it('prunes globalLogTimestamps correctly with 250 entries (write-pointer no-shift)', () => {
        vi.useFakeTimers();
        const start = Date.now();
        vi.setSystemTime(start);

        const settings = baseSettings();
        settings.logPerModuleCap = 0;
        settings.logGlobalCap = 0; // disable all caps so all 250 messages emit timestamps
        const logger = new HealerLogger('StressMod', mockPlugin, settings);

        for (let i = 0; i < 250; i++) {
            logger.info(`stress-msg-${i}`);
        }

        const globalTimestamps = (logger as unknown as { globalLogTimestamps: number[] }).globalLogTimestamps;
        expect(globalTimestamps.length).toBe(250);

        vi.setSystemTime(start + 6000);

        logger.info('post-prune probe');

        expect(globalTimestamps.length).toBe(1);

        const buffer = (logger as unknown as { logBuffer: Array<unknown> }).logBuffer;
        expect(buffer.length).toBe(251);

        vi.useRealTimers();
    });

    it('prunes moduleLogCounts correctly after 200+ entries across modules', () => {
        vi.useFakeTimers();
        const start = Date.now();
        vi.setSystemTime(start);

        const loggerA = new HealerLogger('ModStressA', mockPlugin, baseSettings());
        const loggerB = new HealerLogger('ModStressB', mockPlugin, baseSettings());

        // Seed 15 messages each (perModuleCap is 10, so 10 emitted, 5 dropped)
        for (let i = 0; i < 15; i++) {
            loggerA.info(`modA-msg-${i}`);
            loggerB.info(`modB-msg-${i}`);
        }

        const moduleCountsA = (loggerA as unknown as { moduleLogCounts: Map<string, number[]> }).moduleLogCounts;
        const moduleCountsB = (loggerB as unknown as { moduleLogCounts: Map<string, number[]> }).moduleLogCounts;

        expect(moduleCountsA.get('ModStressA')?.length).toBe(10);
        expect(moduleCountsB.get('ModStressB')?.length).toBe(10);

        // Advance past window
        vi.setSystemTime(start + 6000);

        // Emit from loggerA — triggers pruneAllModuleCounts across ALL moduleCounts
        // loggerB's moduleCounts are not on loggerA, but loggerA's pruneAllModuleCounts
        // only prunes loggerA's own moduleCounts map.
        loggerA.info('post-prune probe A');

        // loggerA's ModStressA count should be pruned to just 1 (the new probe)
        expect(moduleCountsA.get('ModStressA')?.length).toBe(1);

        // Now emit from loggerB to prune its moduleCounts
        loggerB.info('post-prune probe B');
        expect(moduleCountsB.get('ModStressB')?.length).toBe(1);

        vi.useRealTimers();
    });

    it('pruneFingerprints handles 200+ entries correctly', () => {
        vi.useFakeTimers();
        const start = Date.now();
        vi.setSystemTime(start);

        const settings = baseSettings();
        settings.logPerModuleCap = 0;
        settings.logGlobalCap = 0; // disable all caps so all 200 messages emit fingerprints
        const logger = new HealerLogger('FingerprintMod', mockPlugin, settings);

        for (let i = 0; i < 200; i++) {
            logger.info(`distinct-fingerprint-${i}`);
        }

        const fingerprints = (logger as unknown as { recentFingerprints: Map<string, number> }).recentFingerprints;
        expect(fingerprints.size).toBe(200);

        vi.setSystemTime(start + 6000);

        logger.info('fingerprint probe');

        expect(fingerprints.size).toBe(1);
        expect(fingerprints.has('info|FingerprintMod|fingerprint probe')).toBe(true);

        vi.useRealTimers();
    });

    it('buffer count is correct after pruning with large dataset', () => {
        vi.useFakeTimers();
        const start = Date.now();
        vi.setSystemTime(start);

        const settings = baseSettings();
        settings.logPerModuleCap = 0;
        settings.logGlobalCap = 0; // disable all caps
        const logger = new HealerLogger('MixedStress', mockPlugin, settings);

        for (let i = 0; i < 250; i++) {
            logger.info(`msg-${i}`);
        }

        let buffer = (logger as unknown as { logBuffer: Array<unknown> }).logBuffer;
        let globalTimestamps = (logger as unknown as { globalLogTimestamps: number[] }).globalLogTimestamps;
        expect(buffer.length).toBe(250);
        expect(globalTimestamps.length).toBe(250);

        vi.setSystemTime(start + 6000);

        for (let i = 0; i < 20; i++) {
            logger.info(`post-${i}`);
        }

        globalTimestamps = (logger as unknown as { globalLogTimestamps: number[] }).globalLogTimestamps;
        expect(globalTimestamps.length).toBe(20);

        buffer = (logger as unknown as { logBuffer: Array<unknown> }).logBuffer;
        expect(buffer.length).toBe(270);

        vi.useRealTimers();
    });
});
