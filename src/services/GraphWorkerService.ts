// Service to manage communication with the graph analysis worker
import { HealerLogger } from '../utils/HealerLogger';

export type AnalysisType = 'PAGERANK' | 'COMMUNITY' | 'BETWEENNESS' | 'FULL_ANALYSIS';

export class GraphWorkerService {
    private worker: Worker | null = null;
    private logger: HealerLogger;
    private pendingCallbacks: Map<string, { resolve: Function; reject: Function }> = new Map();
    private requestId: number = 0;

    constructor(logger: HealerLogger) {
        this.logger = logger;
    }

    async initialize(): Promise<void> {
        if (this.worker) {
            this.logger.warn('Worker already initialized');
            return;
        }

        try {
            // Create worker pointing to the TS source file (esbuild v0.20+ handles automatic bundling)
            this.worker = new Worker(new URL('../workers/graph-analysis-worker.ts', import.meta.url), {
                type: 'module',
            });

            this.worker.onmessage = (e) => this.handleWorkerMessage(e);
            this.worker.onerror = (e) => this.handleWorkerError(e);

            this.logger.info('✅ Web Worker initialized (TS Source Mode)');
        } catch (error) {
            this.logger.error('❌ Worker initialization failed', error);
            throw error;
        }
    }

    private handleWorkerMessage(e: MessageEvent): void {
        const { type, payload } = e.data;
        const requestId = payload.requestId;

        if (type === 'RESULT' && requestId) {
            const callback = this.pendingCallbacks.get(requestId);
            if (callback) {
                callback.resolve(payload.data);
                this.pendingCallbacks.delete(requestId);
            }
        } else if (type === 'ERROR' && requestId) {
            const callback = this.pendingCallbacks.get(requestId);
            if (callback) {
                callback.reject(new Error(payload.message));
                this.pendingCallbacks.delete(requestId);
            }
        } else if (type === 'PROGRESS') {
            // Reset timeout on progress if needed, for simplicity we keep it at 2 min
            this.logger.debug('Progress:', payload);
        }
    }

    private handleWorkerError(e: ErrorEvent): void {
        this.logger.error('Worker error:', {
            message: e.message,
            filename: e.filename,
            lineno: e.lineno,
        });
    }

    async runAnalysis(
        type: AnalysisType,
        nodes: Array<{ key: string; attributes: any }>,
        edges: Array<{ source: string; target: string; attributes: any }>,
        options?: any,
    ): Promise<any> {
        if (!this.worker) {
            throw new Error('Worker not initialized. Call initialize() first.');
        }

        return new Promise((resolve, reject) => {
            const requestId = `req_${Date.now()}_${this.requestId++}`;
            this.pendingCallbacks.set(requestId, { resolve, reject });

            this.worker!.postMessage({
                type,
                payload: { nodes, edges, requestId },
                options,
            });

            // Optimized timeout (2 minutes for reactive UX)
            setTimeout(() => {
                if (this.pendingCallbacks.has(requestId)) {
                    this.pendingCallbacks.delete(requestId);
                    reject(new Error(`Analysis timeout for ${type} after 2 minutes`));
                }
            }, 120000);
        });
    }

    async terminate(): Promise<void> {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
            this.pendingCallbacks.clear();
            this.logger.info('Worker terminated');
        }
    }

    async destroy(): Promise<void> {
        await this.terminate();
        this.logger.info('GraphWorkerService destroyed');
    }
}
