import * as lbugST from '@ladybugdb/wasm-core';
import * as lbugMT from '@ladybugdb/wasm-core/multithreaded';

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

type SyncItem = 
    | { type: 'node'; data: NodeData[] }
    | { type: 'link'; data: LinkData[] };

interface IncomingMessage {
    type: 'init' | 'query' | 'sync';
    useSharedArrayBuffer?: boolean;
    query?: string;
    params?: Record<string, unknown>;
    batch?: SyncItem[];
}

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
    const { type, useSharedArrayBuffer, query, params, batch } = e.data;

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
            const result = await connection.query(query ?? '', params ?? {});
            const rows = await result.getAllObjects();
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
            for (const item of batch ?? []) {
                if (item.type === 'node') {
                    for (const node of item.data) {
                        await connection.query(
                            'MERGE (n:Node {path: $path}) SET n.label = $label, n.size = $size',
                            { path: node.path, label: node.label, size: node.size }
                        );
                    }
                } else if (item.type === 'link') {
                    for (const link of item.data) {
                        await connection.query(
                            'MATCH (a:Node {path: $from}), (b:Node {path: $to}) MERGE (a)-[r:SemanticLink {type: $type}]->(b) SET r.weight = $weight',
                            { from: link.from, to: link.to, type: link.type, weight: link.weight }
                        );
                    }
                }
            }
            self.postMessage({ type: 'sync-complete' });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            self.postMessage({ type: 'error', message });
        }
    }
};
