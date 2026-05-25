import { App, Platform } from 'obsidian';
import type { ExtendedManifest } from '../../types';

export type InitializationStatus = 'none' | 'loading' | 'ready' | 'legacy';

interface WorkerMessage {
    type: 'init-progress' | 'ready' | 'error';
    mode?: 'mt-wasm' | 'st-wasm';
    progress?: number;
    message?: string;
}

interface QueryResultResponse {
    type: 'query-result';
    rows: unknown[];
}

interface SyncCompleteResponse {
    type: 'sync-complete';
}

interface ErrorResponse {
    type: 'error';
    message: string;
}

interface AlgoResultResponse {
    type: 'algo-result';
    result: unknown;
}

type LadybugWorkerResponse = QueryResultResponse | SyncCompleteResponse | AlgoResultResponse | ErrorResponse;

/**
 * Service managing the LadybugDB WASM engine.
 * Handles worker initialization, progress tracking, and communication
 * for running graph algorithms and Cypher queries in a background thread.
 */
export class LadybugService {
    /** The active Web Worker instance for LadybugDB. */
    private worker: Worker | null = null;
    /** The temporary Object URL created for the worker script. */
    private workerUrl: string | null = null;
    /** The current initialization status of the service. */
    private status: InitializationStatus = 'none';
    /** The current loading progress percentage (0-100). */
    private progress: number = 0;
    /** Resolver for the initialization promise. */
    private initResolver: (() => void) | null = null;
    /** Rejecter for the initialization promise. */
    private initRejecter: ((reason: Error) => void) | null = null;

    /**
     * Creates a new instance of LadybugService.
     *
     * @param app - The Obsidian App instance.
     * @param manifest - The extended plugin manifest.
     */
    constructor(
        private app: App,
        private manifest: ExtendedManifest,
    ) {}

    /**
     * Gets the current initialization status of the Ladybug worker.
     */
    get initializationStatus(): InitializationStatus {
        return this.status;
    }

    /**
     * Gets the current loading progress percentage (0-100).
     */
    get loadingProgress(): number {
        return this.progress;
    }

    /**
     * Initializes the WASM worker for LadybugDB.
     * Triggers fallback to legacy mode on mobile devices or if initialization fails.
     *
     * @returns A promise that resolves when the worker is successfully initialized.
     * @throws {Error} If worker script creation or loading fails.
     */
    async initialize(): Promise<void> {
        if (this.status !== 'none') return;

        this.status = 'loading';
        this.progress = 0;

        try {
            if (Platform.isMobile) {
                // Graceful degradation for mobile
                this.status = 'legacy';
                return;
            }

            const pluginDir = this.manifest.dir;
            if (!pluginDir) {
                throw new Error('Plugin directory undefined in manifest');
            }

            const workerContent = await this.app.vault.adapter.read(`${pluginDir}/ladybug-worker.js`);
            const blob = new Blob([workerContent], {
                type: 'application/javascript',
            });
            this.workerUrl = URL.createObjectURL(blob);
            this.worker = new Worker(this.workerUrl);

            return new Promise((resolve, reject) => {
                this.initResolver = resolve;
                this.initRejecter = reject;

                if (!this.worker) return reject(new Error('Worker creation failed'));

                this.worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
                    const { type, progress, message } = e.data;

                    if (type === 'init-progress') {
                        this.progress = progress ?? 0;
                    } else if (type === 'ready') {
                        this.status = 'ready';
                        this.progress = 100;
                        this.initResolver?.();
                    } else if (type === 'error') {
                        this.status = 'legacy';
                        this.initRejecter?.(new Error(message || 'Unknown WASM error'));
                    }
                };

                const useSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
                this.worker.postMessage({ type: 'init', useSharedArrayBuffer });
            });
        } catch (error) {
            this.status = 'legacy';
            if (this.workerUrl) {
                URL.revokeObjectURL(this.workerUrl);
                this.workerUrl = null;
            }
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

    /**
     * Executes a Cypher query via the LadybugDB worker.
     *
     * @param query - The Cypher query string to execute.
     * @param params - Optional parameter mapping for the query.
     * @returns A promise resolving to an array of query results.
     * @throws {Error} If the worker is not ready or if the query fails.
     */
    async query(query: string, params: Record<string, unknown> = {}): Promise<unknown[]> {
        if (this.status !== 'ready' || !this.worker) {
            throw new Error('LadybugDB not ready');
        }

        return new Promise((resolve, reject) => {
            const handler = (e: MessageEvent<LadybugWorkerResponse>) => {
                if (e.data.type === 'query-result') {
                    this.worker?.removeEventListener('message', handler);
                    resolve(e.data.rows);
                } else if (e.data.type === 'error') {
                    this.worker?.removeEventListener('message', handler);
                    reject(new Error(e.data.message));
                }
            };
            this.worker?.addEventListener('message', handler);
            this.worker?.postMessage({ type: 'query', query, params });
        });
    }

    /**
     * Synchronizes a batch of nodes or links to the LadybugDB instance.
     *
     * @param batch - Array of data batches to sync (nodes or links).
     * @returns A promise resolving when the synchronization is complete.
     * @throws {Error} If the worker is not ready or if sync fails.
     */
    async sync(batch: { type: 'node' | 'link'; data: unknown[] }[]): Promise<void> {
        if (this.status !== 'ready' || !this.worker) {
            throw new Error('LadybugDB not ready');
        }

        return new Promise((resolve, reject) => {
            const handler = (e: MessageEvent<LadybugWorkerResponse>) => {
                if (e.data.type === 'sync-complete') {
                    this.worker?.removeEventListener('message', handler);
                    resolve();
                } else if (e.data.type === 'error') {
                    this.worker?.removeEventListener('message', handler);
                    reject(new Error(e.data.message));
                }
            };
            this.worker?.addEventListener('message', handler);
            this.worker?.postMessage({ type: 'sync', batch });
        });
    }

    /**
     * Runs a specified graph algorithm on the LadybugDB worker.
     *
     * @param algoName - The name of the algorithm to run ('pagerank' or 'louvain').
     * @returns A promise resolving to the generic result of the algorithm.
     * @throws {Error} If the worker is not ready or if the algorithm execution fails.
     */
    async runAlgo(algoName: 'pagerank' | 'louvain'): Promise<unknown> {
        if (this.status !== 'ready' || !this.worker) {
            throw new Error('LadybugDB not ready');
        }

        return new Promise((resolve, reject) => {
            const handler = (e: MessageEvent<LadybugWorkerResponse>) => {
                if (e.data.type === 'algo-result') {
                    this.worker?.removeEventListener('message', handler);
                    resolve(e.data.result);
                } else if (e.data.type === 'error') {
                    this.worker?.removeEventListener('message', handler);
                    reject(new Error(e.data.message));
                }
            };
            this.worker?.addEventListener('message', handler);
            this.worker?.postMessage({ type: 'algo', algoName });
        });
    }

    /**
     * Terminates the LadybugDB worker and frees allocated memory URLs.
     */
    terminate(): void {
        this.worker?.terminate();
        this.worker = null;
        if (this.workerUrl) {
            URL.revokeObjectURL(this.workerUrl);
            this.workerUrl = null;
        }
        this.status = 'none';
    }
}
