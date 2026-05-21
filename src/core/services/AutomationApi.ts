import type { HealerAutomationApi, HealerNotifier, Suggestion, TopologicalMetrics } from '../../types';

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
    };
    cache: {
        suggestions: Suggestion[];
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
        return this.plugin.cache.suggestions.map(s => ({
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
            graphVersion: 'v1'
        };
    }
}
