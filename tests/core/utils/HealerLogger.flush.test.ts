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

describe('HealerLogger Flush (IN-05)', () => {
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

    it('pendingWriteCount starts at 0 for a fresh logger', () => {
        expect(logger.pendingWriteCount).toBe(0);
    });

    it('flush() resolves without error when no writes are pending', async () => {
        await expect(logger.flush()).resolves.toBeUndefined();
        expect(logger.pendingWriteCount).toBe(0);
    });

    it('flush() awaits all in-flight writeToFile promises and drains the queue', async () => {
        // Replace writeToFile with a never-resolving promise so we can
        // observe the queue before it drains naturally.
        const pendingResolvers: Array<() => void> = [];
        (logger as unknown as { writeToFile: () => Promise<void> }).writeToFile = vi.fn().mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    pendingResolvers.push(resolve);
                }),
        );

        logger.info('first');
        logger.info('second');
        logger.info('third');

        // Three writes queued (fileLogging default-false path still calls
        // writeToFile synchronously and awaits the returned promise).
        expect(logger.pendingWriteCount).toBe(3);

        // Kick off flush() but don't await it yet.
        const flushPromise = logger.flush();

        // flush() snapshots the queue immediately, so subsequent
        // enqueues land in the new array.
        logger.info('fourth');
        expect(logger.pendingWriteCount).toBe(1);

        // Resolve the first batch.
        pendingResolvers.forEach((r) => r());
        await flushPromise;

        // First batch is drained; the post-flush log is still pending.
        expect(logger.pendingWriteCount).toBe(1);

        // Resolve the straggler.
        pendingResolvers.splice(0).forEach((r) => r());
        await logger.flush();
        expect(logger.pendingWriteCount).toBe(0);
    });

    it('flush() tolerates a rejected writeToFile (allSettled semantics)', async () => {
        (logger as unknown as { writeToFile: () => Promise<void> }).writeToFile = vi
            .fn()
            .mockImplementation(async () => {
                throw new Error('disk full');
            });

        logger.warn('rejection probe');
        expect(logger.pendingWriteCount).toBe(1);

        // allSettled means flush() resolves even though the inner
        // writeToFile rejected. The .catch() we attach at the call
        // site also converts the rejection to undefined, so the
        // outer promise never rejects either.
        await expect(logger.flush()).resolves.toBeUndefined();
        expect(logger.pendingWriteCount).toBe(0);
    });

    it('clearBuffer() enqueues a pending write that flush() can drain', async () => {
        let resolved = false;
        (logger as unknown as { writeToFile: () => Promise<void> }).writeToFile = vi.fn().mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    resolved = true;
                    resolve();
                }),
        );

        logger.info('seed');
        expect(logger.pendingWriteCount).toBe(1);
        resolved = false;

        logger.clearBuffer();
        expect(logger.pendingWriteCount).toBe(2);

        await logger.flush();
        expect(logger.pendingWriteCount).toBe(0);
        expect(resolved).toBe(true);
    });
});
