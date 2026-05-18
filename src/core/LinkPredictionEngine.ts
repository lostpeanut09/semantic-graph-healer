import { TFile } from 'obsidian';
import type { Suggestion } from '../types';
import { HealerLogger } from './HealerUtils';
import type { GraphContext } from './services/PluginContext';
import { SmartConnectionsAdapter } from './adapters/SmartConnectionsAdapter';

export interface PredictionOptions {
    limit?: number;
    minScore?: number;
}

/**
 * LinkPredictionEngine: Formalized service for topological similarity analysis.
 * Uses Jaccard, Adamic-Adar, and Resource Allocation indices.
 */
export class LinkPredictionEngine {
    constructor(private context: GraphContext) {}

    /**
     * Dispatches similarity analysis to the Web Worker and synthesizes suggestions.
     */
    public async predictLinks(
        nodes: Array<{ key: string; attributes: Record<string, unknown> }>,
        edges: Array<{ source: string; target: string; attributes: Record<string, unknown> }>,
        options: PredictionOptions = {},
    ): Promise<Suggestion[]> {
        HealerLogger.info('LinkPredictionEngine: Running similarity analysis (Worker offloaded)...');

        try {
            const worker = this.context.graphWorkerService;
            const results = await worker.runAnalysis<Array<{ source: string; target: string; score: number }>>(
                'SIMILARITY',
                nodes,
                edges,
                {
                    weights: this.context.settings.linkPredictionWeights,
                    limit: options.limit || 5,
                    fileStats: this.getFileStats(),
                },
            );

            if (!results) return [];

            let scAdapter: SmartConnectionsAdapter | null = null;
            if (this.context.settings.enableSmartConnections) {
                scAdapter = new SmartConnectionsAdapter(this.context.app);
            }

            const suggestions: Suggestion[] = [];
            for (const res of results) {
                let finalScore = res.score;
                let htrWeight = this.context.settings.htrStructuralWeight ?? 0.6;
                let semanticScore = 0;

                if (scAdapter && scAdapter.isAvailable()) {
                    const related = await scAdapter.getRelatedNotes(res.source, 100);
                    const targetRel = related.find((r) => r.path === res.target);
                    if (targetRel) {
                        semanticScore = targetRel.score > 1 ? targetRel.score / 100 : targetRel.score;
                    }

                    const normalizedStruct = res.score > 1 ? res.score / 100 : res.score;
                    finalScore = normalizedStruct * htrWeight + semanticScore * (1 - htrWeight);
                }

                // If finalScore is normalized (0-1), scale to 1-100 for minScore check and UI
                const scaledScore = finalScore > 1 ? finalScore : finalScore * 100;

                if (options.minScore && scaledScore < options.minScore) continue;

                const fileS = this.context.app.vault.getAbstractFileByPath(res.source);
                const fileT = this.context.app.vault.getAbstractFileByPath(res.target);
                if (!(fileS instanceof TFile) || !(fileT instanceof TFile)) continue;

                suggestions.push({
                    id: `predicted_link:${res.source}:${res.target}`,
                    type: 'semantic_inference',
                    link: this.pathToLink(res.target),
                    source: `Predicted Semantic Connection: [[${fileS.basename}]] and [[${fileT.basename}]] share high topological similarity (Score: ${finalScore.toFixed(2)}).`,
                    timestamp: Date.now(),
                    category: 'suggestion',
                    meta: {
                        confidence: Math.round(scaledScore),
                        sourcePath: res.source,
                        targetPath: res.target,
                        sourceNote: fileS.basename,
                        targetNote: fileT.basename,
                        description: `Topological similarity predicted via Jaccard/AA/RA hybrid.`,
                    },
                });
            }

            return suggestions;
        } catch (e) {
            HealerLogger.error('LinkPredictionEngine: Similarity analysis failed.', e);
            return [];
        }
    }

    private getFileStats(): Record<string, { mtime: number }> {
        const stats: Record<string, { mtime: number }> = {};
        this.context.app.vault.getMarkdownFiles().forEach((f) => {
            stats[f.path] = { mtime: f.stat.mtime };
        });
        return stats;
    }

    private pathToLink(path: string): string {
        const file = this.context.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            return `[[${file.basename}]]`;
        }
        return `[[${path}]]`;
    }
}
