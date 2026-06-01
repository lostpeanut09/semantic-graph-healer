import { App, TFile } from 'obsidian';
import { basename } from 'pathe';
import type { Suggestion, DataviewApi, ReasoningResult, SemanticGraphHealerSettings } from '../types';
import { HealerLogger, resolveTargetFile, formatIncongruencePrompt, calculateHtrScore } from './HealerUtils';
import { SmartConnectionsAdapter } from './DataAdapter';
import type { EmbeddingService } from './EmbeddingService';

/**
 * ReasoningService: AI-powered analysis for incongruence resolution.
 * Fully decoupled from UI and Obsidian environment utilities — testable and reusable.
 */
export class ReasoningService {
    private scAdapter: SmartConnectionsAdapter;

    /**
     * Initializes the ReasoningService.
     * @param app - The Obsidian App instance.
     * @param settings - The plugin's semantic settings.
     * @param llm - The LLM interface for calling and parsing reasoning results.
     * @param dv - The Dataview API instance, if available.
     * @param embeddingService - Optional embedding service for semantic pre-filtering.
     */
    constructor(
        private app: App,
        private settings: SemanticGraphHealerSettings,
        private llm: {
            callLlm: (
                prompt: string,
                tribunal: boolean,
                signal?: AbortSignal,
                embeddings?: { source: number[]; target: number[] },
            ) => Promise<string>;
            parseReasoningResult: (raw: string) => Omit<ReasoningResult, 'rawResponse'>;
        },
        private dv: DataviewApi | null,
        private embeddingService?: EmbeddingService,
    ) {
        this.scAdapter = new SmartConnectionsAdapter(app);
    }

    /**
     * Analyzes an incongruence suggestion using AI reasoning.
     * Offloads the heavy lifting to the configured LlmService and incorporates structural metadata.
     * @param suggestion - The incongruence suggestion to analyze.
     * @returns A promise resolving to a ReasoningResult, or null if analysis fails or criteria are not met.
     */
    async analyze(suggestion: Suggestion): Promise<ReasoningResult | null> {
        // RESILIENT METADATA EXTRACTION (SOTA 2026)
        // For incongruences, targetNote might be missing, use sourceNote as subject.
        const noteName =
            suggestion.meta?.targetNote ||
            suggestion.meta?.sourceNote ||
            (suggestion.meta?.sourcePath ? basename(suggestion.meta.sourcePath, '.md') : null);

        const prop = suggestion.meta?.property;
        const values = suggestion.meta?.competingValues ?? suggestion.meta?.losers;

        if (!noteName || !prop || !values?.length) {
            HealerLogger.warn('Cannot reason: missing structured metadata on suggestion.', {
                id: suggestion.id,
                noteName,
                prop,
                valuesCount: values?.length,
            });
            return null;
        }

        try {
            HealerLogger.info(`ReasoningService: Analyzing suggestion ${suggestion.id} for note ${noteName}`);
            const targetFile = resolveTargetFile(this.app, suggestion);

            if (!(targetFile instanceof TFile)) {
                HealerLogger.error(
                    `ReasoningService: Target file not found or invalid for suggestion ${suggestion.id}`,
                    {
                        link: suggestion.link,
                        meta: suggestion.meta,
                    },
                );
                return null;
            }

            const content = await this.app.vault.read(targetFile);
            HealerLogger.debug('ReasoningService: Target file read successfully.');

            // 1. Gather candidate data
            const candidateData = await this.gatherCandidateData(suggestion, values, targetFile.path);
            HealerLogger.debug('ReasoningService: Candidate data gathered.', candidateData);

            // 1.5 SOTA 2026: Semantic Pre-filtering (HARDEN-08)
            let embeddings: { source: number[]; target: number[] } | undefined;
            if (this.embeddingService && this.settings.enableAiTribunal) {
                try {
                    // Collect embeddings for the source and the primary winner (first value)
                    const winnerNote = values[0].replace(/^\[\[/, '').replace(/\]\]$/, '');
                    const winnerFile = this.app.metadataCache.getFirstLinkpathDest(winnerNote, targetFile.path);
                    if (winnerFile instanceof TFile) {
                        const [sourceVec, targetVec] = await Promise.all([
                            this.embeddingService.getEmbedding(content.substring(0, 1000)),
                            this.embeddingService.getEmbedding(winnerNote),
                        ]);
                        embeddings = { source: sourceVec, target: targetVec };
                    }
                } catch (e) {
                    HealerLogger.debug('ReasoningService: Failed to gather embeddings for pre-filter.', e);
                }
            }

            // 2. Build prompt
            const isInfraNodus = suggestion.source.toLowerCase().includes('infranodus');
            const prompt = formatIncongruencePrompt(
                noteName,
                prop,
                values,
                content.substring(0, 1000),
                candidateData,
                isInfraNodus,
            );
            HealerLogger.debug('ReasoningService: Prompt generated.');

            // 3. Call LLM
            HealerLogger.info('ReasoningService: Dispatching call to LlmService...');
            const response = await this.llm.callLlm(prompt, this.settings.enableAiTribunal, undefined, embeddings);

            if (!response || response.startsWith('Error:')) {
                HealerLogger.error(`ReasoningService: LLM call returned error or empty response: ${response}`);
                return null;
            }

            HealerLogger.info('ReasoningService: LLM response received. Parsing...');
            const parsed = this.llm.parseReasoningResult(response);

            if (!parsed.winner) {
                HealerLogger.warn('ReasoningService: LLM response parsed but no WINNER identified.', { response });
            }

            // 4. Return result (no side-effects on input suggestion)
            return {
                ...parsed,
                rawResponse: response,
            };
        } catch (error) {
            HealerLogger.error(
                `ReasoningService: UNCAUGHT EXCEPTION during analysis for suggestion ${suggestion.id}:`,
                error,
            );
            return null;
        }
    }

    /**
     * Gathers structural and semantic metadata for a list of competing candidate values.
     * Incorporates folder depth, tags, and Smart Connections scores.
     * @param _suggestion - The original suggestion triggering the reasoning.
     * @param targets - The list of candidate note names or links.
     * @param notePath - The path of the source note being analyzed.
     * @returns A promise resolving to a map of candidate data for each target.
     */
    private async gatherCandidateData(
        _suggestion: Suggestion,
        targets: string[],
        notePath: string,
    ): Promise<Record<string, Record<string, unknown>>> {
        const candidateData: Record<string, Record<string, unknown>> = {};

        // PERFORMANCE: Fetch SC results once per analysis
        let scResults: Suggestion[] = [];
        if (this.settings.enableSmartConnections && this.scAdapter.isAvailable()) {
            scResults = await this.scAdapter.query(notePath, 20);
        }

        for (const val of targets) {
            const cleanVal = val.replace(/^\[\[/, '').replace(/\]\]$/, '');
            // Use getFirstLinkpathDest to resolve safely from source context
            const cFile = this.app.metadataCache.getFirstLinkpathDest(cleanVal, notePath);

            if (!cFile) continue;

            const folderDepth = cFile.path.split('/').length; // Obsidian paths are always forward-slash
            let scScore = 0;

            // Use cached SC results
            const match = scResults.find((r) => r.meta?.targetPath === cFile.path);
            if (match?.meta?.confidence) {
                scScore = match.meta.confidence;
            }

            candidateData[val] = {
                folder: cFile.parent?.path || 'root',
                tags: this.dv?.page(cFile.path)?.file?.etags || [],
                score: calculateHtrScore(scScore, folderDepth),
            };
        }

        return candidateData;
    }
}
