import type { DataAdapter } from 'obsidian';
import type { GraphEngine } from '../GraphEngine';
import type { LlmService } from '../LlmService';
import type { EmbeddingService } from '../EmbeddingService';
import type { AjsonStorage } from '../utils/AjsonStorage';
import type { SemanticGraphHealerSettings } from '../../types';
import { HealerLogger } from '../utils/HealerLogger';
import { cosineSimilarity } from '../HealerUtils';
import { join } from 'pathe';
import type { Entity } from './EntityExtractor';

/**
 * Represents the summarized semantic profile of a topological community.
 */
export interface CommunitySummary {
    /** Unique identifier for the community. */
    communityId: number;
    /** LLM-generated summary of the community's theme. */
    summary: string;
    /** Vector embedding of the community summary. */
    embedding: number[];
    /** List of note paths belonging to this community. */
    notes: string[];
    /** Generation timestamp. */
    timestamp: number;
}

/**
 * Represents the result of a GraphRAG query execution.
 */
export interface GraphRagResult {
    /** The LLM-generated response. */
    answer: string;
    /** The communities that contributed to the context, with relevance scores. */
    communities: (CommunitySummary & { score: number })[];
}

/**
 * GraphRagService: Orchestrates community-centric summarization and RAG query execution.
 */
export class GraphRagService {
    /** Filename for community summaries index. */
    private readonly summaryFile = 'community_summaries.ajson';
    /** Filename for entity index. */
    private readonly entitiesFile = 'entities.ajson';
    /** Filename for relationship index. */
    private readonly relationshipsFile = 'relationships.ajson';

    /**
     * Initializes the GraphRagService.
     * @param graphEngine - The graph engine used for topology analysis.
     * @param llmService - Service for LLM communication.
     * @param embeddingService - Service for generating vector embeddings.
     * @param storage - Storage service for persisting summaries and entities.
     * @param adapter - Obsidian data adapter for file system operations.
     * @param settings - Plugin settings.
     */
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
     * @returns A promise that resolves when community indexing is complete.
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

    /**
     * Executes a context-aware RAG query using community and entity indices.
     * @param queryText - The user's query string.
     * @returns A promise resolving to the RAG result containing the answer and related communities.
     */
    public async query(queryText: string): Promise<GraphRagResult> {
        HealerLogger.info(`GraphRagService: Executing RAG query: "${queryText}"`);

        const dir = this.settings.graphRagIndexDir || '.planning/index';
        const indexPath = join(dir, this.summaryFile);
        const entitiesPath = join(dir, this.entitiesFile);

        try {
            // 1. Get query embedding
            const queryVector = await this.embeddingService.getEmbedding(queryText);

            // 2. Search community summaries
            const summaries = await this.storage.readAll<CommunitySummary>(indexPath);
            const scoredCommunities = summaries
                .map((s) => ({
                    ...s,
                    score: cosineSimilarity(queryVector, s.embedding),
                }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 3); // Pick top 3 communities

            // 3. Load entity context
            const entities = await this.storage.readAll<Entity>(entitiesPath);
            const relevantEntities = entities
                .filter((e) => scoredCommunities.some((c) => c.notes.includes(e.notePath)))
                .slice(0, 20); // Limit to top 20 relevant entities

            // 4. Build context string
            let context = '=== RELEVANT COMMUNITIES ===\n';
            for (const comm of scoredCommunities) {
                context += `- [ID ${comm.communityId}] Theme: ${comm.summary}\n`;
                context += `  Notes: ${comm.notes.slice(0, 5).join(', ')}${comm.notes.length > 5 ? '...' : ''}\n`;
            }

            context += '\n=== RELEVANT ENTITIES ===\n';
            for (const entity of relevantEntities) {
                context += `- ${entity.name} (${entity.type}) [Found in: ${entity.notePath}]\n`;
            }

            // 5. Final LLM Query
            const prompt = `
[CONTEXT: Knowledge Graph RAG Search]

You are an expert knowledge assistant. Answer the user query based on the following graph context.

=== GRAPH CONTEXT ===
${context}

=== USER QUERY ===
${queryText}

=== INSTRUCTIONS ===
- Use the community themes to understand the high-level context.
- Use the entities to ground your answer in specific facts.
- If the context doesn't contain enough information, state it clearly.
- Provide a concise but comprehensive answer.
`;

            const answer = await this.llmService.callLlm(prompt, false);
            return {
                answer,
                communities: scoredCommunities,
            };
        } catch (e) {
            HealerLogger.error('GraphRagService: Query execution failed', e as Error);
            return {
                answer: `Query failed: ${(e as Error).message}`,
                communities: [],
            };
        }
    }
}
