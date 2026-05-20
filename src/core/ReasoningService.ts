import { App, TFile } from 'obsidian';
import { join, basename, dirname } from 'pathe';
import type { Suggestion, DataviewApi, ReasoningResult, SemanticGraphHealerSettings } from '../types';
import { HealerLogger, resolveTargetFile, formatIncongruencePrompt, calculateHtrScore } from './HealerUtils';
import { SmartConnectionsAdapter } from './DataAdapter';

/**
 * ReasoningService: AI-powered analysis for incongruence resolution.
 * Fully decoupled from UI and Obsidian environment utilities — testable and reusable.
 */
export class ReasoningService {
    private scAdapter: SmartConnectionsAdapter;

    constructor(
        private app: App,
        private settings: SemanticGraphHealerSettings,
        private llm: {
            callLlm: (prompt: string, tribunal: boolean) => Promise<string>;
            parseReasoningResult: (raw: string) => Omit<ReasoningResult, 'rawResponse'>;
        },
        private dv: DataviewApi | null,
    ) {
        this.scAdapter = new SmartConnectionsAdapter(app);
    }

    /**
     * Analyze an incongruence suggestion via AI reasoning.
     * Returns the ReasoningResult if successful, null otherwise.
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

            // 1. Gather candidate metadata
            const candidateData = await this.gatherCandidateData(suggestion, values, targetFile.path);
            HealerLogger.debug('ReasoningService: Candidate data gathered.', candidateData);

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
            const response = await this.llm.callLlm(prompt, this.settings.enableAiTribunal);

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
     * Gather structural + semantic metadata for each competing value.
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
