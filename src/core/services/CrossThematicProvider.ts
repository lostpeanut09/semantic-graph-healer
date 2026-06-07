import type { GraphEngine } from '../GraphEngine';
import type { AjsonStorage } from '../utils/AjsonStorage';
import type { CommunitySummary } from './GraphRagService';
import type { Suggestion, SemanticGraphHealerSettings } from '../../types';
import { HealerLogger } from '../utils/HealerLogger';
import { cosineSimilarity, generateId } from '../HealerUtils';
import { join } from 'pathe';

/**
 * CrossThematicProvider: Bridges topologically distant but semantically related clusters.
 * Uses community embeddings to find 'invisible' relationships across the vault.
 */
export class CrossThematicProvider {
    /** The filename for community summaries in the GraphRAG index. */
    private readonly summaryFile = 'community_summaries.ajson';

    /**
     * Initializes the CrossThematicProvider.
     * @param graphEngine - The graph engine used for topology analysis.
     * @param storage - Storage service for reading community summaries.
     * @param settings - Plugin settings.
     */
    constructor(
        private graphEngine: GraphEngine,
        private storage: AjsonStorage,
        private settings: SemanticGraphHealerSettings,
    ) {}

    /**
     * Identifies potential cross-thematic links by comparing community embeddings.
     * @returns A promise that resolves to an array of semantic link suggestions.
     */
    async getSuggestions(): Promise<Suggestion[]> {
        HealerLogger.info('CrossThematicProvider: Analyzing thematic overlaps...');

        const dir = this.settings.graphRagIndexDir || '.planning/index';
        const indexPath = join(dir, this.summaryFile);

        const summaries = await this.storage.readAll<CommunitySummary>(indexPath);
        if (summaries.length < 2) return [];

        const suggestions: Suggestion[] = [];
        const threshold = 0.75; // Only suggest high-confidence semantic overlaps

        for (let i = 0; i < summaries.length; i++) {
            for (let j = i + 1; j < summaries.length; j++) {
                const s1 = summaries[i];
                const s2 = summaries[j];

                const similarity = cosineSimilarity(s1.embedding, s2.embedding);
                if (similarity >= threshold) {
                    // Check if they are structurally distant
                    // (For now, we assume if they are different communities, a bridge is worth suggesting)

                    const note1 = s1.notes[0];
                    const note2 = s2.notes[0];

                    if (note1 && note2) {
                        suggestions.push({
                            id: generateId('semantic_inference'),
                            type: 'semantic_inference',
                            category: 'suggestion',
                            link: `[[${note2.split('/').pop()?.replace('.md', '')}]]`,
                            source: `Cross-Thematic Bridge: Community ${s1.communityId} ("${s1.summary}") and Community ${s2.communityId} ("${s2.summary}") share a semantic similarity of ${(similarity * 100).toFixed(1)}%.`,
                            timestamp: Date.now(),
                            meta: {
                                sourcePath: note1,
                                targetPath: note2,
                                confidence: Math.round(similarity * 100),
                                description: `Suggested semantic bridge between distant thematic clusters.`,
                            },
                        });
                    }
                }
            }
        }

        HealerLogger.info(`CrossThematicProvider: Found ${suggestions.length} potential bridges.`);
        return suggestions;
    }
}
