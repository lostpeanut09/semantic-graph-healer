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
    result: any;
}

type LadybugWorkerResponse = QueryResultResponse | SyncCompleteResponse | AlgoResultResponse | ErrorResponse;

export class LadybugService {
    private worker: Worker | null = null;
    private status: InitializationStatus = 'none';
    private progress: number = 0;
    private initResolver: (() => void) | null = null;
    private initRejecter: ((reason: Error) => void) | null = null;

    get initializationStatus(): InitializationStatus {
        return this.status;
    }

    get loadingProgress(): number {
        return this.progress;
    }

    async initialize(): Promise<void> {
        if (this.status !== 'none') return;

        this.status = 'loading';
        this.progress = 0;

        try {
            // In Obsidian, the path would be relative to the plugin folder
            // For tests, we use the mocked Worker
            this.worker = new Worker(new URL('../workers/ladybug-worker.ts', import.meta.url));

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
            throw error instanceof Error ? error : new Error(String(error));
        }
    }

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

    async runAlgo(algoName: 'pagerank' | 'louvain'): Promise<any> {
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

    terminate(): void {
        this.worker?.terminate();
        this.worker = null;
        this.status = 'none';
    }
}
