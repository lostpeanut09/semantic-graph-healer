import { DataAdapter } from 'obsidian';
import type { GraphEngine } from '../GraphEngine';
import type { LlmService } from '../LlmService';
import type { EmbeddingService } from '../EmbeddingService';
import type { AjsonStorage } from '../utils/AjsonStorage';
import type { SemanticGraphHealerSettings } from '../../types';
import { HealerLogger } from '../HealerUtils';
import { join } from 'pathe';

export interface CommunitySummary {
    communityId: number;
    summary: string;
    embedding: number[];
    notes: string[];
    timestamp: number;
}

export class GraphRagService {
    private readonly summaryFile = 'community_summaries.ajson';

    constructor(
        private graphEngine: GraphEngine,
        private llmService: LlmService,
        private embeddingService: EmbeddingService,
        private storage: AjsonStorage,
        private adapter: DataAdapter,
        private settings: SemanticGraphHealerSettings,
    ) {}

    /**
     * Builds the community-centric summarization and vector indexing pipeline.
     */
    public async indexCommunities(): Promise<void> {
        HealerLogger.info('GraphRagService: Starting community indexing...');

        const cache = this.graphEngine.getTopologicalMetrics();
        const communities = cache.communities;

        if (!communities || Object.keys(communities).length === 0) {
            HealerLogger.warn('GraphRagService: No communities found in GraphEngine cache.');
            return;
        }

        // Group notes by community
        const clusters: Record<number, string[]> = {};
        for (const [path, commId] of Object.entries(communities)) {
            const id = typeof commId === 'number' ? commId : parseInt(commId);
            if (!clusters[id]) clusters[id] = [];
            clusters[id].push(path);
        }

        const dir = this.settings.graphRagIndexDir || '.planning/index';
        const indexPath = join(dir, this.summaryFile);

        // Ensure index directory exists
        if (!(await this.adapter.exists(dir))) {
            await this.adapter.mkdir(dir);
        }

        for (const [commIdStr, paths] of Object.entries(clusters)) {
            const commId = parseInt(commIdStr);
            HealerLogger.info(`GraphRagService: Summarizing community ${commId} (${paths.length} notes)...`);

            const titles = paths.map((p: string) => p.split('/').pop()?.replace('.md', '') || p).join(', ');
            const prompt = `Summarize the shared theme of these notes: ${titles}`;

            try {
                const summary = await this.llmService.callLlm(prompt);
                const embedding = await this.embeddingService.getEmbedding(summary);

                await this.storage.upsert(indexPath, 'communityId', {
                    communityId: commId,
                    summary,
                    embedding,
                    notes: paths,
                    timestamp: Date.now(),
                });
            } catch (e) {
                HealerLogger.error(`GraphRagService: Failed to summarize community ${commId}`, e as Error);
            }
        }

        HealerLogger.info('GraphRagService: Community indexing complete.');
    }
}
