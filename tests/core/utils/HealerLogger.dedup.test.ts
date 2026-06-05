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

describe('HealerLogger Deduplication', () => {
    let logger: HealerLogger;
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
        logger = new HealerLogger('ModA', mockPlugin, baseSettings());
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('test_dedup_dropsIdenticalMessageWithinWindow', () => {
        logger.info('hello world');
        logger.info('hello world');
        logger.info('hello world');

        const buffer = (logger as any).logBuffer as Array<{ message: string }>;
        expect(buffer.length).toBe(1);
    });

    it('test_dedup_keepsDifferentMessage', () => {
        logger.info('hello world');
        logger.info('hello there');
        logger.info('goodbye world');

        const buffer = (logger as any).logBuffer as Array<{ message: string }>;
        expect(buffer.length).toBe(3);
    });

    it('test_dedup_keepsDifferentModule', () => {
        const loggerB = new HealerLogger('ModB', mockPlugin, baseSettings());
        logger.info('shared message');
        loggerB.info('shared message');

        const bufferA = (logger as any).logBuffer as Array<{ message: string }>;
        const bufferB = (loggerB as any).logBuffer as Array<{ message: string }>;
        expect(bufferA.length).toBe(1);
        expect(bufferB.length).toBe(1);
    });

    it('test_dedup_keepsDifferentLevel', () => {
        logger.info('cross-level message');
        logger.warn('cross-level message');
        logger.error('cross-level message');

        const buffer = (logger as any).logBuffer as Array<{
            message: string;
            level: string;
        }>;
        expect(buffer.length).toBe(3);
        expect(buffer.map((e) => e.level).sort()).toEqual(['error', 'info', 'warn']);
    });

    it('test_dedup_windowExpiry', () => {
        vi.useFakeTimers();
        const start = Date.now();
        vi.setSystemTime(start);

        logger.info('resurface');
        expect(((logger as any).logBuffer as Array<unknown>).length).toBe(1);

        vi.setSystemTime(start + 5001);
        logger.info('resurface');
        const buffer = (logger as any).logBuffer as Array<{ message: string }>;
        expect(buffer.length).toBe(2);
    });

    it('test_dedup_configurableWindow', () => {
        vi.useFakeTimers();
        const start = Date.now();
        vi.setSystemTime(start);

        logger.setDedupConfig({ windowMs: 100 });
        logger.info('tight window');
        vi.setSystemTime(start + 50);
        logger.info('tight window');
        expect(((logger as any).logBuffer as Array<unknown>).length).toBe(1);

        vi.setSystemTime(start + 150);
        logger.info('tight window');
        const buffer = (logger as any).logBuffer as Array<{ message: string }>;
        expect(buffer.length).toBe(2);
    });

    it('test_dedup_prunesStaleFingerprints_keepsBoundedGrowth (CR-02 regression)', () => {
        vi.useFakeTimers();
        const start = Date.now();
        vi.setSystemTime(start);

        // Lift the per-module cap so all 50 unique fingerprints can flow through.
        logger.setDedupConfig({ perModuleCap: 0 });

        // Seed many unique fingerprints.
        for (let i = 0; i < 50; i++) {
            logger.info(`distinct message ${i}`);
        }
        const fingerprints = (logger as any).recentFingerprints as Map<string, number>;
        expect(fingerprints.size).toBe(50);

        // Advance past the dedup window; the next emit should prune the stale entries.
        vi.setSystemTime(start + 5001);
        logger.info('post-window probe');

        // All 50 stale fingerprints should have been pruned; only the new probe remains.
        expect(fingerprints.size).toBe(1);
        expect(fingerprints.has('info|ModA|post-window probe')).toBe(true);
    });

    it('test_dedup_dropsAbandonedModuleEntries (CR-02 regression)', () => {
        vi.useFakeTimers();
        const start = Date.now();
        vi.setSystemTime(start);

        // Seed timestamps under the ModA logger.
        logger.info('orphan-1');
        logger.info('orphan-2');
        const moduleCounts = (logger as any).moduleLogCounts as Map<string, number[]>;
        expect(moduleCounts.has('ModA')).toBe(true);

        // Manually inject a stale (already-expired) module entry to simulate
        // a long-abandoned module that no longer emits.
        const staleArr: number[] = [start - 10_000];
        moduleCounts.set('AbandonedMod', staleArr);

        // Advance past the dedup window; the next emit on the live ModA
        // logger should prune both the abandoned entry and any other
        // empty-after-prune modules.
        vi.setSystemTime(start + 6000);
        logger.info('post-window probe');

        expect(moduleCounts.has('AbandonedMod')).toBe(false);
        // ModA is still active (just emitted), so it must remain.
        expect(moduleCounts.has('ModA')).toBe(true);
    });
});
