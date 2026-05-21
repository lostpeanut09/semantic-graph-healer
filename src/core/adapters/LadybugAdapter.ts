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
    async findBlackHoles(threshold: number = 5): Promise<{ path: string; inDegree: number }[]> {
        // In LadybugDB/Kuzu, we can use SIZE subqueries for degree
        const cypher = `
            MATCH (n:Node)
            WHERE SIZE([ (n)-[]->() | n ]) = 0
              AND SIZE([ ()-[]->(n) | n ]) > $threshold
            RETURN n.path AS path, SIZE([ ()-[]->(n) | n ]) AS inDegree
            `;
        return this.query<{ path: string; inDegree: number }>(cypher, { threshold });
    }

    /**
     * Finds "Bridges" (nodes that connect two other nodes which are not directly connected).
     */
    async findBridges(): Promise<{ source: string; target: string; via: string; type: string }[]> {
        const cypher = `
            MATCH (a:Node)-[r1]->(b:Node)-[r2]->(c:Node)
            WHERE r1.type = r2.type
              AND NOT (a)-[]->(c)
              AND a <> c
            RETURN a.path AS source, c.path AS target, b.path AS via, r1.type AS type
            `;
        return this.query<{ source: string; target: string; via: string; type: string }>(cypher);
    }

    /**
     * Detects cycles in the graph up to a certain depth.
     */
    async findCycles(maxDepth: number = 5): Promise<{ path: string[]; type: string }[]> {
        // Since LadybugDB doesn't have a built-in 'all nodes in path' return for cycles easily in one go
        // with the same structure, we'll use a query that returns the path.
        const cypher = `
            MATCH p = (n:Node)-[*1..${maxDepth}]->(n)
            RETURN nodes(p) AS nodes, [r IN relationships(p) | r.type] AS types
            `;
        const results = await this.query<{ nodes: unknown[]; types: string[] }>(cypher);

        return results.map((r) => {
            const path = r.nodes.map((n: { path: string }) => n.path as string);
            // Cycle type is 'universal' if mixed, otherwise the common type
            const uniqueTypes = new Set(r.types);
            const type = uniqueTypes.size === 1 ? Array.from(uniqueTypes)[0] : 'universal';
            return { path, type };
        });
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
    }
}
