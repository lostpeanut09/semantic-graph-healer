/**
 * LadybugDB Worker
 *
 * Background worker thread for LadybugDB, a WASM-based graph database.
 * Handles schema initialization, Cypher queries, data synchronization,
 * and graph algorithm execution (Pagerank, Louvain) using LadybugDB and Graphology.
 */

import lbugST from '@ladybugdb/wasm-core';
import lbugMT from '@ladybugdb/wasm-core/multithreaded';
import { DirectedGraph } from 'graphology';
import pagerank from 'graphology-metrics/centrality/pagerank';
import louvain from 'graphology-communities-louvain';

let db: lbugST.Database | null = null;
let connection: lbugST.Connection | null = null;

const SCHEMA_VERSION = '1';

interface NodeData {
    path: string;
    label: string;
    size: number;
}

interface LinkData {
    from: string;
    to: string;
    type: string;
    weight: number;
}

type SyncItem = { type: 'node'; data: NodeData[] } | { type: 'link'; data: LinkData[] };

interface IncomingMessage {
    type: 'init' | 'query' | 'sync' | 'algo';
    useSharedArrayBuffer?: boolean;
    query?: string;
    params?: Record<string, unknown>;
    batch?: SyncItem[];
    algoName?: 'pagerank' | 'louvain';
}

/**
 * Initializes the LadybugDB schema if it's missing or outdated.
 * Creates Metadata, Node, and SemanticLink tables.
 *
 * @param conn - The active LadybugDB connection.
 * @returns A promise that resolves when the schema is initialized.
 */
async function initializeSchema(conn: lbugST.Connection) {
    let currentVersion = '0';
    try {
        const result = await conn.query('MATCH (m:Metadata) RETURN m.version AS version');
        const rows = await result.getAllObjects();
        if (rows.length > 0) {
            currentVersion = rows[0].version as string;
        }
    } catch {
        // Table likely doesn't exist
    }

    if (currentVersion !== SCHEMA_VERSION) {
        // Drop tables if they exist
        const tables = ['SemanticLink', 'Node', 'Metadata'];
        for (const table of tables) {
            try {
                await conn.query(`DROP TABLE ${table}`);
            } catch {
                // Ignore if doesn't exist
            }
        }

        // Create tables
        await conn.query('CREATE NODE TABLE Metadata(key STRING, version STRING, PRIMARY KEY (key))');
        await conn.query('CREATE NODE TABLE Node(path STRING, label STRING, size INT64, PRIMARY KEY (path))');
        await conn.query('CREATE REL TABLE SemanticLink(FROM Node TO Node, weight DOUBLE, type STRING)');

        // Set version
        await conn.query(`CREATE (:Metadata {key: 'schema', version: '${SCHEMA_VERSION}'})`);
    }
}

self.onmessage = async (e: MessageEvent<IncomingMessage>) => {
    const { type, useSharedArrayBuffer, query, params, batch, algoName } = e.data;

    if (type === 'init') {
        try {
            self.postMessage({ type: 'init-progress', progress: 10 });

            const lbug = useSharedArrayBuffer ? lbugMT : lbugST;
            const mode = useSharedArrayBuffer ? 'mt-wasm' : 'st-wasm';

            self.postMessage({ type: 'init-progress', progress: 30 });

            // LadybugDB initialization
            await lbug.init();

            self.postMessage({ type: 'init-progress', progress: 60 });

            db = new lbug.Database(':memory:');
            connection = new lbug.Connection(db);

            await connection.init();

            // Initialize Schema
            await initializeSchema(connection);

            self.postMessage({ type: 'init-progress', progress: 100 });
            self.postMessage({ type: 'ready', mode });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error('LadybugWorker Init Error:', error);
            self.postMessage({ type: 'error', message });
        }
    } else if (type === 'query') {
        if (!connection) {
            self.postMessage({ type: 'error', message: 'Database not initialized' });
            return;
        }
        try {
            const stmt = await connection.prepare(query ?? '');
            const result = await connection.execute(stmt, params ?? {});
            const rows = await result.getAllObjects();
            await stmt.close();
            self.postMessage({ type: 'query-result', rows });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            self.postMessage({ type: 'error', message });
        }
    } else if (type === 'sync') {
        if (!connection) {
            self.postMessage({ type: 'error', message: 'Database not initialized' });
            return;
        }
        try {
            const nodeStmt = await connection.prepare(
                'MERGE (n:Node {path: $path}) SET n.label = $label, n.size = $size',
            );
            const linkStmt = await connection.prepare(
                'MATCH (a:Node {path: $from}), (b:Node {path: $to}) MERGE (a)-[r:SemanticLink {type: $type}]->(b) SET r.weight = $weight',
            );

            for (const item of batch ?? []) {
                if (item.type === 'node') {
                    for (const node of item.data) {
                        await connection.execute(nodeStmt, {
                            path: node.path,
                            label: node.label,
                            size: node.size,
                        });
                    }
                } else if (item.type === 'link') {
                    for (const link of item.data) {
                        await connection.execute(linkStmt, {
                            from: link.from,
                            to: link.to,
                            type: link.type,
                            weight: link.weight,
                        });
                    }
                }
            }
            await nodeStmt.close();
            await linkStmt.close();
            self.postMessage({ type: 'sync-complete' });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            self.postMessage({ type: 'error', message });
        }
    } else if (type === 'algo') {
        if (!connection) {
            self.postMessage({ type: 'error', message: 'Database not initialized' });
            return;
        }
        try {
            // Fetch graph from LadybugDB to Graphology
            const nodesResult = await connection.query('MATCH (n:Node) RETURN n.path AS path');
            const nodesRows = await nodesResult.getAllObjects();

            const linksResult = await connection.query(
                'MATCH (a:Node)-[r:SemanticLink]->(b:Node) RETURN a.path AS from, b.path AS to, r.weight AS weight',
            );
            const linksRows = await linksResult.getAllObjects();

            const graph = new DirectedGraph();
            nodesRows.forEach((n) => graph.addNode(n.path));
            linksRows.forEach((l) => {
                if (!graph.hasEdge(l.from, l.to as string)) {
                    graph.addEdge(l.from, l.to, { weight: l.weight as number });
                }
            });

            let result: unknown;
            if (algoName === 'pagerank') {
                result = pagerank(graph);
            } else if (algoName === 'louvain') {
                result = louvain(graph);
            }

            self.postMessage({ type: 'algo-result', result });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            self.postMessage({ type: 'error', message });
        }
    }
};
