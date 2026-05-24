import type { HealerAutomationApi, HealerNotifier, Suggestion, TopologicalMetrics, HistoryItem } from '../../types';
import { generateId } from '../HealerUtils';

class SilentNotifier implements HealerNotifier {
    show(message: string, type?: 'info' | 'error' | 'warning'): void {
        console.info(`[SilentNotifier][${type || 'info'}] ${message}`);
    }
}

/**
 * Minimal interface required from SemanticGraphHealer for AutomationApi to work.
 * Avoids direct circular dependency on main.ts.
 */
export interface AutomationPluginContext {
    executor: {
        getNotifier(): HealerNotifier;
        setNotifier(notifier: HealerNotifier): void;
        execute(suggestion: Suggestion): Promise<boolean>;
        undo(historyItem: HistoryItem): Promise<boolean>;
        activeBatchId?: string;
    };
    cache: {
        suggestions: Suggestion[];
        history: HistoryItem[];
        save(): void;
        topologicalScores?: {
            pageRank?: Record<string, number>;
            betweenness?: Record<string, number>;
            communities?: Record<string, number>;
        };
    };
    settings: {
        lastScanTimestamp: number;
    };
    analyzeGraph(silent?: boolean): Promise<void>;
}

export class AutomationApi implements HealerAutomationApi {
    private silentNotifier = new SilentNotifier();

    constructor(private plugin: AutomationPluginContext) {}

    async runAnalysis(options: { silent: boolean }): Promise<Suggestion[]> {
        const originalNotifier = this.plugin.executor.getNotifier();

        if (options.silent) {
            this.plugin.executor.setNotifier(this.silentNotifier);
        }

        try {
            await this.plugin.analyzeGraph(options.silent);
            return this.getSuggestions();
        } finally {
            if (options.silent) {
                this.plugin.executor.setNotifier(originalNotifier);
            }
        }
    }

    getSuggestions(): Suggestion[] {
        // Optimize cloning for large vaults (e.g., shallow clone of properties needed for JSON output only).
        return this.plugin.cache.suggestions.map((s) => ({
            id: s.id,
            type: s.type,
            category: s.category,
            link: s.link,
            source: s.source,
            timestamp: s.timestamp,
            reasoning: s.reasoning ? { ...s.reasoning } : undefined,
            meta: s.meta ? { ...s.meta } : undefined,
        }));
    }

    getMetrics(): TopologicalMetrics | null {
        const cache = this.plugin.cache;
        if (!cache.topologicalScores) return null;

        return {
            pageRank: cache.topologicalScores.pageRank || {},
            betweenness: cache.topologicalScores.betweenness || {},
            communities: cache.topologicalScores.communities || {},
            lastAnalysisTimestamp: this.plugin.settings.lastScanTimestamp,
            graphVersion: 'v1',
        };
    }

    async executeBatch(options: { confidence: number; category?: string }): Promise<{
        success: boolean;
        batchId: string;
        appliedCount: number;
        failedCount: number;
    }> {
        const batchId = generateId('batch');

        // Normalize confidence (0-1 range to 0-100 range)
        const targetConfidence = options.confidence <= 1 ? options.confidence * 100 : options.confidence;

        // Filter suggestions based on confidence and category
        const suggestionsToApply = this.plugin.cache.suggestions.filter((s) => {
            const conf = s.meta?.confidence ?? 0;
            const matchesConfidence = conf >= targetConfidence;
            const matchesCategory = options.category ? s.category === options.category : true;
            return matchesConfidence && matchesCategory;
        });

        if (suggestionsToApply.length === 0) {
            return {
                success: true,
                batchId,
                appliedCount: 0,
                failedCount: 0,
            };
        }

        // Tag all operations in this batch
        this.plugin.executor.activeBatchId = batchId;

        let appliedCount = 0;
        let failedCount = 0;

        try {
            for (const suggestion of suggestionsToApply) {
                const success = await this.plugin.executor.execute(suggestion);
                if (success) {
                    appliedCount++;
                } else {
                    failedCount++;
                }
            }
        } finally {
            this.plugin.executor.activeBatchId = undefined;
        }

        return {
            success: failedCount === 0,
            batchId,
            appliedCount,
            failedCount,
        };
    }

    async undoBatch(batchId: string): Promise<{
        success: boolean;
        revertedCount: number;
        failedCount: number;
    }> {
        // Find history items belonging to this batch
        const batchItems = this.plugin.cache.history.filter((item) => item.batchId === batchId);

        if (batchItems.length === 0) {
            return {
                success: false,
                revertedCount: 0,
                failedCount: 0,
            };
        }

        let revertedCount = 0;
        let failedCount = 0;

        // Revert in reverse order
        const itemsToUndo = [...batchItems].reverse();

        for (const item of itemsToUndo) {
            const success = await this.plugin.executor.undo(item);
            if (success) {
                revertedCount++;
                const idx = this.plugin.cache.history.indexOf(item);
                if (idx !== -1) {
                    this.plugin.cache.history.splice(idx, 1);
                }
            } else {
                failedCount++;
            }
        }

        // Trigger cache save to persist history changes
        this.plugin.cache.save();

        return {
            success: failedCount === 0,
            revertedCount,
            failedCount,
        };
    }
}
