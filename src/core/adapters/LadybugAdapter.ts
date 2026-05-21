import { LadybugService } from '../services/LadybugService';
import { UnifiedMetadataAdapter } from './UnifiedMetadataAdapter';
import { HealerLogger } from '../HealerUtils';

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
        private metadataAdapter: UnifiedMetadataAdapter
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

            const nodes = pages.map(p => ({
                path: p.file?.path || (p as unknown).path || (p as unknown).$path,
                label: p.file?.name || '',
                size: p.file?.size || 0
            })).filter(n => n.path);

            const semanticLinks = links.map(l => ({
                from: l.sourcePath,
                to: l.targetPath,
                type: l.type,
                weight: l.confidence || 1.0
            }));

            // Use batched sync in the worker for better performance
            await this.ladybugService.sync([
                { type: 'node', data: nodes },
                { type: 'link', data: semanticLinks }
            ]);
        } catch (error) {
            HealerLogger.error('LadybugAdapter: fullSync failed', error);
            throw error;
        }
    }

    /**
     * Executes a Cypher query against LadybugDB.
     */
    async query(cypher: string, params: Record<string, unknown> = {}): Promise<unknown[]> {
        return this.ladybugService.query(cypher, params);
    }

    /**
     * Checks the current schema version in the database.
     */
    async getSchemaVersion(): Promise<string> {
        const result = await this.query('MATCH (m:Metadata) RETURN m.version AS version');
        return result.length > 0 ? result[0].version : '0';
    }
}
