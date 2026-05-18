import { App, Platform } from 'obsidian';
import type { SemanticGraphHealerSettings } from '../../types';
import { HealerLogger } from '../utils/HealerLogger';

/**
 * PerformanceService (Wave 2)
 * Manages Adaptive Performance (Safety Mode) to proactively handle large vaults.
 * State machine that transitions between 'Standard' and 'Safety' modes.
 */
export class PerformanceService {
    private app: App;
    private settings: SemanticGraphHealerSettings;
    private logger: HealerLogger;
    private _performanceMode: 'Standard' | 'Safety' = 'Standard';

    constructor(app: App, settings: SemanticGraphHealerSettings, logger: HealerLogger) {
        this.app = app;
        this.settings = settings;
        this.logger = logger;
    }

    /**
     * The current performance mode.
     */
    get performanceMode(): 'Standard' | 'Safety' {
        return this._performanceMode;
    }

    /**
     * Re-evaluates the performance mode based on vault size, platform, and settings.
     * Transitions the state machine and logs the outcome.
     */
    reEvaluate(): 'Standard' | 'Safety' {
        if (!this.settings.enableSafetyMode) {
            this._performanceMode = 'Standard';
            this.settings.performanceMode = 'Standard';
            return 'Standard';
        }

        const markdownFiles = this.app.vault.getMarkdownFiles();
        const noteCount = markdownFiles.length;

        const threshold = Platform.isMobile
            ? this.settings.safetyModeThresholdMobile
            : this.settings.safetyModeThresholdDesktop;

        const previousMode = this._performanceMode;

        if (noteCount >= threshold) {
            this._performanceMode = 'Safety';
        } else {
            this._performanceMode = 'Standard';
        }

        // Only log on transition or first run
        if (previousMode !== this._performanceMode) {
            this.logger.info(
                `Performance Mode Transition: ${previousMode} -> ${this._performanceMode} ` +
                    `(Notes: ${noteCount}, Threshold: ${threshold})`,
            );
        }

        // Sync with settings runtime state
        this.settings.performanceMode = this._performanceMode;

        return this._performanceMode;
    }

    /**
     * Returns true if Safety Mode is currently active.
     */
    isSafetyModeActive(): boolean {
        return this._performanceMode === 'Safety';
    }

    /**
     * Returns recommended batch size for operations based on current mode.
     */
    getRecommendedBatchSize(): number {
        return this._performanceMode === 'Safety' ? 10 : 50;
    }

    /**
     * Returns recommended delay (ms) between background tasks.
     */
    getRecommendedDelay(): number {
        return this._performanceMode === 'Safety' ? 1000 : 100;
    }
}
