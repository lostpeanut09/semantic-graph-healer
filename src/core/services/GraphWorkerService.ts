import { HealerLogger } from '../utils/HealerLogger';
import { Platform, App } from 'obsidian';
import { SemanticGraphHealerSettings } from '../../types';
import PQueue from 'p-queue';

type AnalysisType = 'PAGERANK' | 'COMMUNITY' | 'BETWEENNESS' | 'FULL_ANALYSIS' | 'COCITATION' | 'SIMILARITY';

interface PluginWithSettings {
    manifest: { dir?: string };
    app: App;
    settings: SemanticGraphHealerSettings;
}

export class GraphWorkerService {
    private worker: Worker | null = null;
    private workerUrl: string | null = null; // Store for memory revocation
    private logger: HealerLogger;
    private plugin: PluginWithSettings;
    private queue: PQueue;

    private initPromise: Promise<void> | null = null;
    private pendingCallbacks: Map<
        string,
        { resolve: (data: unknown) => void; reject: (error: Error) => void; timeoutId?: ReturnType<typeof setTimeout> }
    > = new Map();
    private requestId: number = 0;

    constructor(logger: HealerLogger, plugin: PluginWithSettings) {
        this.plugin = plugin;
        this.logger = logger;
        this.queue = new PQueue({ concurrency: 1 });
    }

    async initialize(): Promise<void> {
        if (this.worker) {
            this.logger.warn('Worker already initialized');
            return;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        if (Platform.isMobile) {
            this.logger.warn(
                'Web Workers are explicitly disabled on mobile devices (iOS/Android) to prevent Capacitor crashes.',
            );
            return Promise.resolve();
        }

        this.initPromise = (async () => {
            try {
                const pluginDir = this.plugin.manifest.dir;
                if (!pluginDir) {
                    throw new Error('Plugin directory undefined in manifest');
                }
                const workerContent = await this.plugin.app.vault.adapter.read(`${pluginDir}/worker.js`);
                const blob = new Blob([workerContent], { type: 'application/javascript' });
                this.workerUrl = URL.createObjectURL(blob);

                this.worker = new Worker(this.workerUrl);

                this.worker.onmessage = (e) => this.handleWorkerMessage(e);
                this.worker.onerror = (e) => this.handleWorkerError(e);

                this.logger.info('Web Worker initialized');
            } catch (error) {
                this.logger.error('Worker initialization failed. Plugin will gracefully degrade.', error);
                this.worker = null;
                // MED-2: revoke Blob URL to prevent memory leak if Worker() failed after createObjectURL
                if (this.workerUrl) {
                    URL.revokeObjectURL(this.workerUrl);
                    this.workerUrl = null;
                }
            } finally {
                this.initPromise = null;
            }
        })();

        return this.initPromise;
    }

    private handleWorkerMessage(e: MessageEvent): void {
        const data = e.data as { type: string; payload: { requestId?: string; data?: unknown; message?: string } };
        const { type, payload } = data;
        const requestId = payload.requestId;

        if (type === 'RESULT' && requestId) {
            const callback = this.pendingCallbacks.get(requestId);
            if (callback) {
                if (callback.timeoutId) clearTimeout(callback.timeoutId);
                callback.resolve(payload.data);
                this.pendingCallbacks.delete(requestId);
            }
        } else if (type === 'ERROR' && requestId) {
            const callback = this.pendingCallbacks.get(requestId);
            if (callback) {
                if (callback.timeoutId) clearTimeout(callback.timeoutId);
                callback.reject(new Error(payload.message));
                this.pendingCallbacks.delete(requestId);
            }
        } else if (type === 'PROGRESS') {
            this.logger.debug('Progress:', payload);
        }
    }

    private handleWorkerError(e: ErrorEvent): void {
        this.logger.error('Worker error:', {
            message: e.message,
            filename: e.filename,
            lineno: e.lineno,
        });

        // Fail-fast: reject all pending requests and terminate to avoid zombie waits
        for (const [requestId, cb] of this.pendingCallbacks.entries()) {
            if (cb.timeoutId) clearTimeout(cb.timeoutId);
            cb.reject(new Error(`Worker error: ${e.message} (request ${requestId})`));
        }
        this.pendingCallbacks.clear();

        // Best effort cleanup
        this.terminate();
    }

    async runAnalysis<T = unknown>(
        type: AnalysisType,
        nodes: Array<{ key: string; attributes: Record<string, unknown> }>,
        edges: Array<{ source: string; target: string; attributes: Record<string, unknown> }>,
        options?: Record<string, unknown>,
    ): Promise<T> {
        if (!this.worker) {
            throw new Error('Worker not initialized. Call initialize() first.');
        }

        return this.queue.add(
            () =>
                new Promise<T>((resolve, reject) => {
                    const requestId = `req_${Date.now()}_${this.requestId++}`;

                    // Optimized timeout (User-defined or 2-minute fallback)
                    const timeoutMs = (this.plugin.settings?.workerTimeout || 120) * 1000;

                    const timeoutId = setTimeout(() => {
                        const callback = this.pendingCallbacks.get(requestId);
                        if (callback) {
                            this.pendingCallbacks.delete(requestId);
                            callback.reject(
                                new Error(`Analysis timeout for ${type} after ${timeoutMs / 1000} seconds`),
                            );
                        }
                    }, timeoutMs);

                    this.pendingCallbacks.set(requestId, { resolve, reject, timeoutId });

                    this.worker!.postMessage({
                        type,
                        payload: { nodes, edges, requestId },
                        options,
                    });
                }),
        );
    }

    terminate(): void {
        this.queue.clear();
        // MED-1: reject pending callers before clearing — prevents hanging promise chains
        for (const [requestId, cb] of this.pendingCallbacks.entries()) {
            if (cb.timeoutId) clearTimeout(cb.timeoutId);
            cb.reject(new Error(`Worker terminated (request ${requestId})`));
        }
        this.pendingCallbacks.clear();

        if (this.worker) {
            this.worker.terminate();
            this.worker = null;

            if (this.workerUrl) {
                URL.revokeObjectURL(this.workerUrl);
                this.workerUrl = null;
            }
            this.logger.info('Worker terminated and memory freed');
        }
    }

    destroy(): void {
        this.terminate();
        this.logger.info('GraphWorkerService destroyed');
    }
}
