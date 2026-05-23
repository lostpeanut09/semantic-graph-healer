import { describe, test, expect, vi } from 'vitest';
import { PerformanceService } from '../../../src/core/services/PerformanceService';
import { App, Platform } from 'obsidian';
import { DEFAULT_SETTINGS } from '../../../src/types';
import { HealerLogger } from '../../../src/core/utils/HealerLogger';

describe('PerformanceService', () => {
    const createMockApp = (numFiles: number) =>
        ({
            vault: {
                getMarkdownFiles: () => new Array(numFiles).fill({}),
            },
        }) as unknown as App;

    const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    } as unknown as HealerLogger;

    test('should transition to Safety mode when note count exceeds threshold (Desktop)', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            enableSafetyMode: true,
            safetyModeThresholdDesktop: 100,
        };
        const app = createMockApp(150);

        // Mock Platform.isMobile
        vi.spyOn(Platform, 'isMobile', 'get').mockReturnValue(false);

        const service = new PerformanceService(app, settings, mockLogger);

        const mode = service.reEvaluate();

        expect(mode).toBe('Safety');
        expect(service.isSafetyModeActive()).toBe(true);
        expect(settings.performanceMode).toBe('Safety');
    });

    test('should transition to Standard mode when note count is below threshold (Desktop)', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            enableSafetyMode: true,
            safetyModeThresholdDesktop: 100,
        };
        const app = createMockApp(50);

        vi.spyOn(Platform, 'isMobile', 'get').mockReturnValue(false);

        const service = new PerformanceService(app, settings, mockLogger);

        const mode = service.reEvaluate();

        expect(mode).toBe('Standard');
        expect(service.isSafetyModeActive()).toBe(false);
        expect(settings.performanceMode).toBe('Standard');
    });

    test('should use mobile threshold when on mobile platform', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            enableSafetyMode: true,
            safetyModeThresholdMobile: 50,
            safetyModeThresholdDesktop: 500,
        };
        const app = createMockApp(75);

        vi.spyOn(Platform, 'isMobile', 'get').mockReturnValue(true);

        const service = new PerformanceService(app, settings, mockLogger);

        const mode = service.reEvaluate();

        expect(mode).toBe('Safety');
    });

    test('should stay in Standard mode if Safety Mode is disabled', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            enableSafetyMode: false,
            safetyModeThresholdDesktop: 10,
        };
        const app = createMockApp(100);

        vi.spyOn(Platform, 'isMobile', 'get').mockReturnValue(false);

        const service = new PerformanceService(app, settings, mockLogger);

        const mode = service.reEvaluate();

        expect(mode).toBe('Standard');
    });

    test('should return correct batch size and delay for each mode', () => {
        const settings = { ...DEFAULT_SETTINGS, enableSafetyMode: true, safetyModeThresholdDesktop: 100 };
        const app = createMockApp(150);
        vi.spyOn(Platform, 'isMobile', 'get').mockReturnValue(false);

        const service = new PerformanceService(app, settings, mockLogger);
        service.reEvaluate(); // Safety mode

        expect(service.getRecommendedBatchSize()).toBe(10);
        expect(service.getRecommendedDelay()).toBe(1000);

        const appSmall = createMockApp(50);
        const serviceSmall = new PerformanceService(appSmall, settings, mockLogger);
        serviceSmall.reEvaluate(); // Standard mode

        expect(serviceSmall.getRecommendedBatchSize()).toBe(50);
        expect(serviceSmall.getRecommendedDelay()).toBe(100);
    });
});
