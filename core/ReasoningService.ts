import { App } from 'obsidian';
import { Suggestion, DataviewApi, ReasoningResult, SemanticGraphHealerSettings } from '../types';
import { HealerLogger, formatIncongruencePrompt, calculateHtrScore } from './HealerUtils';
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
        const noteName = suggestion.meta?.targetNote;
        const prop = suggestion.meta?.property;
        const values = suggestion.meta?.competingValues ?? suggestion.meta?.losers;

        if (!noteName || !prop || !values?.length) {
            HealerLogger.warn('Cannot reason: missing structured metadata on suggestion.', suggestion.id);
            return null;
        }

        const targetFile = this.app.vault.getMarkdownFiles().find((f) => f.basename === noteName);
        if (!targetFile) {
            HealerLogger.warn(`Target file not found: ${noteName}`);
            return null;
        }

        const content = await this.app.vault.read(targetFile);

        // 1. Gather candidate metadata
        const candidateData = await this.gatherCandidateData(noteName, values);

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

        // 3. Call LLM
        const response = await this.llm.callLlm(prompt, this.settings.enableAiTribunal);
        const parsed = this.llm.parseReasoningResult(response);

        // 4. Return result (no side-effects on input suggestion)
        return {
            ...parsed,
            rawResponse: response,
        };
    }

    /**
     * Gather structural + semantic metadata for each competing value.
     */
    private async gatherCandidateData(
        noteName: string,
        values: string[],
    ): Promise<Record<string, Record<string, unknown>>> {
        const candidateData: Record<string, Record<string, unknown>> = {};

        // PERFORMANCE: Fetch SC results once per analysis
        let scResults: Suggestion[] = [];
        if (this.settings.enableSmartConnections && this.scAdapter.isAvailable()) {
            scResults = await this.scAdapter.query(noteName, 20);
        }

        for (const val of values) {
            const cleanVal = val.replace(/^\[\[/, '').replace(/\]\]$/, '');
            const cFile = this.app.vault.getMarkdownFiles().find((f) => f.basename === cleanVal);

            if (!cFile) continue;

            const folderDepth = cFile.path.split('/').length;
            let scScore = 0;

            // Use cached SC results
            const match = scResults.find((r) => r.link.includes(cleanVal));
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
