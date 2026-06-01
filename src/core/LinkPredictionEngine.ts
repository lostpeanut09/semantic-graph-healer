import { TFile } from 'obsidian';
import type { Suggestion, RelatedNote } from '../types';
import { HealerLogger } from './HealerUtils';
import type { GraphContext } from './services/PluginContext';
import { SmartConnectionsAdapter } from './adapters/SmartConnectionsAdapter';

/**
 * Options for link prediction analysis.
 */
export interface PredictionOptions {
    /** Maximum number of suggestions to return. */
    limit?: number;
    /** Minimum confidence score threshold (1-100). */
    minScore?: number;
}

/**
 * LinkPredictionEngine: Formalized service for topological similarity analysis.
 * Uses Jaccard, Adamic-Adar, and Resource Allocation indices.
 */
export class LinkPredictionEngine {
    /**
     * Initializes the LinkPredictionEngine.
     * @param context - The graph context providing app, settings, and services.
     */
    constructor(private context: GraphContext) {}

    /**
     * Dispatches similarity analysis to the Web Worker and synthesizes suggestions.
     * @param nodes - Array of nodes with keys and attributes.
     * @param edges - Array of edges with source, target, and attributes.
     * @param options - Configuration options for the prediction.
     * @returns A promise that resolves to an array of link suggestions.
     */
    public async predictLinks(
        nodes: Array<{ key: string; attributes: Record<string, unknown> }>,
        edges: Array<{
            source: string;
            target: string;
            attributes: Record<string, unknown>;
        }>,
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

            const scAdapter = this.context.settings.enableSmartConnections
                ? new SmartConnectionsAdapter(this.context.app)
                : null;

            const suggestions: Suggestion[] = [];
            const semanticCache = new Map<string, RelatedNote[]>();

            for (const res of results) {
                let finalScore = res.score;
                let htrWeight = this.context.settings.htrStructuralWeight ?? 0.6;
                let semanticScore = 0;

                if (scAdapter && scAdapter.isAvailable()) {
                    let related = semanticCache.get(res.source);
                    if (!related) {
                        related = await scAdapter.getRelatedNotes(res.source, 100);
                        semanticCache.set(res.source, related);
                    }

                    const targetRel = related.find((r) => r.path === res.target);
                    if (targetRel) {
                        // All adapters now return standardized 0-1 scores
                        semanticScore = targetRel.score;
                    }

                    // Structural scores from worker are strictly 0-1 (Jaccard, etc.)
                    const normalizedStruct = res.score;
                    finalScore = normalizedStruct * htrWeight + semanticScore * (1 - htrWeight);
                }

                // If finalScore is normalized (0-1), scale to 1-100 for minScore check and UI
                const scaledScore = finalScore * 100;

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

    /**
     * Collects modification timestamps for all markdown files.
     * @returns A record of file paths and their modification times.
     */
    private getFileStats(): Record<string, { mtime: number }> {
        const stats: Record<string, { mtime: number }> = {};
        this.context.app.vault.getMarkdownFiles().forEach((f) => {
            stats[f.path] = { mtime: f.stat.mtime };
        });
        return stats;
    }

    /**
     * Converts a file path to a Wikilink string.
     * @param path - The file path to convert.
     * @returns A formatted Wikilink string.
     */
    private pathToLink(path: string): string {
        const file = this.context.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            return `[[${file.basename}]]`;
        }
        return `[[${path}]]`;
    }
}
