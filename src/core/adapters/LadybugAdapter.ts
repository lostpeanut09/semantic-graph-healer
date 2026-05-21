import { LadybugService } from '../services/LadybugService';
import { UnifiedMetadataAdapter } from './UnifiedMetadataAdapter';
import { HealerLogger } from '../HealerUtils';

interface ObsidianPage {
    file?: {
        path: string;
        name: string;
        size: number;
    };
    path?: string;
    $path?: string;
}

/**
 * LadybugAdapter: Data sync bridge between UnifiedMetadataAdapter and LadybugDB.
 * Responsibilities:
 * 1. Orchestrate initial full sync of vault data to LadybugDB.
 * 2. Provide a clean Cypher query interface for the core engine.
 * 3. Handle schema-aware data transformations.
 */
export class LadybugAdapter {
    private initialized = false;

    constructor(
        private ladybugService: LadybugService,
        private metadataAdapter: UnifiedMetadataAdapter,
    ) {}

    /**
     * Initializes the LadybugDB engine and performs initial data ingestion.
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;

        // LadybugService handles the worker lifecycle and schema checks in the worker
        await this.ladybugService.initialize();
        await this.fullSync();

        this.initialized = true;
        HealerLogger.debug('LadybugAdapter initialized and full sync completed.');
    }

    /**
     * Performs a full synchronization of nodes and links from the metadata adapter.
     */
    async fullSync(): Promise<void> {
        try {
            const links = await this.metadataAdapter.getLinksSafe();
            const pages = await this.metadataAdapter.queryPages('');

            const nodes = pages
                .map((p: ObsidianPage) => ({
                    path: (p.file?.path || p.path || p.$path) as string,
                    label: p.file?.name || '',
                    size: p.file?.size || 0,
                }))
                .filter((n) => n.path);

            const semanticLinks = links.map((l) => ({
                from: l.sourcePath,
                to: l.targetPath,
                type: l.type,
                weight: l.confidence || 1.0,
            }));

            // Use batched sync in the worker for better performance
            await this.ladybugService.sync([
                { type: 'node', data: nodes },
                { type: 'link', data: semanticLinks },
            ]);
            } catch (error) {
            HealerLogger.error('LadybugAdapter: fullSync failed', error);
            throw error;
            }
            }

            /**
            * Executes a Cypher query against LadybugDB.
            */
            async query<T = unknown>(cypher: string, params: Record<string, unknown> = {}): Promise<T[]> {
            return this.ladybugService.query(cypher, params) as Promise<T[]>;
            }

            /**
            * Returns the current schema version from the Metadata table.
            */
            async getSchemaVersion(): Promise<string | null> {
            try {
            const result = await this.query<{ version: string }>('MATCH (m:Metadata) RETURN m.version AS version');
            if (result.length > 0) {
                return result[0].version;
            }
            return null;
            } catch {
            return null;
            }
            }

            /**
            * Finds "Black Holes" (nodes with high in-degree but zero out-degree).
            */
            async findBlackHoles(threshold: number = 5): Promise<string[]> {
            // In LadybugDB/Kuzu, we can use SIZE subqueries for degree
            const cypher = `
            MATCH (n:Node)
            WHERE SIZE([ (n)-[]->() | n ]) = 0
              AND SIZE([ ()-[]->(n) | n ]) > $threshold
            RETURN n.path AS path
            `;
            const result = await this.query<{ path: string }>(cypher, { threshold });
            return result.map((r) => r.path);
            }

            /**
            * Finds "Bridges" (nodes that connect two other nodes which are not directly connected).
            */
            async findBridges(): Promise<string[]> {
            const cypher = `
            MATCH (a:Node)-[r1]->(b:Node)-[r2]->(c:Node)
            WHERE r1.type = r2.type
              AND NOT (a)-[]->(c)
              AND a <> c
            RETURN DISTINCT b.path AS path
            `;
            const result = await this.query<{ path: string }>(cypher);
            return result.map((r) => r.path);
            }

            /**
            * Detects cycles in the graph up to a certain depth.
            */
            async findCycles(maxDepth: number = 5): Promise<unknown[]> {
            const cypher = `
            MATCH p = (n:Node)-[*1..${maxDepth}]->(n)
            RETURN p
            `;
            return this.query(cypher);
            }

            /**
            * Runs the PageRank algorithm on the graph.
            */
            async getPageRank(): Promise<Record<string, number>> {
            return (await this.ladybugService.runAlgo('pagerank')) as Record<string, number>;
            }

            /**
            * Runs the Louvain community detection algorithm on the graph.
            */
            async getLouvainCommunities(): Promise<Record<string, number>> {
            return (await this.ladybugService.runAlgo('louvain')) as Record<string, number>;
            }}
