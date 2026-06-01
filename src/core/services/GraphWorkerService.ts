import { HealerLogger } from '../utils/HealerLogger';
import { Platform, App } from 'obsidian';
import type { SemanticGraphHealerSettings, HealerNotifier } from '../../types';
import PQueue from 'p-queue';
import { handleGraphWorkerMessage, type WorkerMessage, type AnalysisType } from '../workers/graph-analysis-core';

/**
 * Hard limit for graph size when running analysis on the main thread (mobile fallback).
 * Prevents UI freezing while still providing useful topological insights.
 */
const MOBILE_NODE_LIMIT = 200;

/**
 * Partial plugin context required by the worker service.
 */
interface PluginWithSettings {
    /** Plugin manifest providing access to the installation directory. */
    manifest: { dir?: string };
    /** Reference to the Obsidian App instance. */
    app: App;
    /** Current plugin settings. */
    settings: SemanticGraphHealerSettings;
}

/**
 * Service responsible for managing the background Web Worker for heavy graph computations.
 * Offloads compute-intensive tasks (like PageRank, communities, topological diagnostics)
 * off the main UI thread to maintain Obsidian's responsiveness.
 */
export class GraphWorkerService {
    /** The active Web Worker instance. */
    private worker: Worker | null = null;
    /** The temporary Object URL created for the worker script. */
    private workerUrl: string | null = null; // Store for memory revocation
    /** The logger instance. */
    private logger: HealerLogger;
    /** The plugin instance providing access to the app, manifest, and settings. */
    private plugin: PluginWithSettings;
    /** Notifier service for user alerts. */
    private notifier: HealerNotifier;
    /** Priority queue for sequential analysis task execution. */
    private queue: PQueue;

    /** Promise used to synchronize concurrent initialization calls. */
    private initPromise: Promise<void> | null = null;
    /** Registry of pending requests waiting for worker response. */
    private pendingCallbacks: Map<
        string,
        {
            resolve: (data: unknown) => void;
            reject: (error: Error) => void;
            timeoutId?: ReturnType<typeof setTimeout>;
        }
    > = new Map();
    /** Incrementing counter for generating unique request IDs. */
    private requestId: number = 0;

    /**
     * Creates a new instance of GraphWorkerService.
     *
     * @param logger - The logger instance.
     * @param plugin - The plugin instance providing access to the app, manifest, and settings.
     * @param notifier - The notifier service instance.
     */
    constructor(logger: HealerLogger, plugin: PluginWithSettings, notifier: HealerNotifier) {
        this.plugin = plugin;
        this.logger = logger;
        this.notifier = notifier;
        this.queue = new PQueue({ concurrency: 1 });
    }

    /**
     * Initializes the Web Worker if it hasn't been initialized yet.
     * On mobile platforms, initialization is skipped to prevent crashes.
     *
     * @returns A promise that resolves when the worker is initialized or gracefully degraded.
     */
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
            this.initPromise = Promise.resolve();
            return this.initPromise;
        }

        this.initPromise = (async () => {
            try {
                const pluginDir = this.plugin.manifest.dir;
                if (!pluginDir) {
                    throw new Error('Plugin directory undefined in manifest');
                }
                const workerContent = await this.plugin.app.vault.adapter.read(`${pluginDir}/worker.js`);
                const blob = new Blob([workerContent], {
                    type: 'application/javascript',
                });
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

    /**
     * Processes messages received from the Web Worker.
     * Matches results to pending requests and handles progress/error updates.
     *
     * @param e - The MessageEvent from the worker.
     */
    private handleWorkerMessage(e: MessageEvent): void {
        const data = e.data as {
            type: string;
            payload: { requestId?: string; data?: unknown; message?: string };
        };
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
            if (this.plugin.settings.logLevel === 'debug') {
                this.logger.debug('Progress:', payload);
            }
        }
    }

    /**
     * Handles fatal errors from the Web Worker.
     * Rejects all pending requests and terminates the worker.
     *
     * @param e - The ErrorEvent from the worker.
     */
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

    /**
     * Submits an analysis task to the Web Worker for background processing.
     * Tasks are queued and executed with a concurrency of 1.
     *
     * @param type - The type of graph analysis to run (e.g., PAGERANK, COMMUNITY).
     * @param nodes - Array of nodes to process.
     * @param edges - Array of edges to process.
     * @param options - Additional options for the analysis type.
     * @returns A promise resolving to the generic result type `T`.
     * @throws {Error} If the worker is not initialized or if the analysis times out.
     */
    async runAnalysis<T = unknown>(
        type: AnalysisType,
        nodes: Array<{ key: string; attributes: Record<string, unknown> }>,
        edges: Array<{
            source: string;
            target: string;
            attributes: Record<string, unknown>;
        }>,
        options?: Record<string, unknown>,
    ): Promise<T> {
        // WR-03: Attempt to re-initialize if worker was terminated (e.g. by handleWorkerError)
        if (!this.worker && !Platform.isMobile) {
            this.logger.info('Worker not initialized or previously terminated. Attempting recovery...');
            await this.initialize();
            if (!this.worker) {
                throw new Error('Worker not available. Automatic recovery failed.');
            }
        }

        return this.queue.add(() => {
            if (this.worker) {
                return new Promise<T>((resolve, reject) => {
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
                });
            } else {
                return this.runMobileFallback<T>(type, nodes, edges, options);
            }
        });
    }

    /**
     * Executes graph analysis on the main thread for mobile platforms,
     * applying strict limits to prevent UI freezing.
     */
    private async runMobileFallback<T>(
        type: AnalysisType,
        nodes: Array<{ key: string; attributes: Record<string, unknown> }>,
        edges: Array<{
            source: string;
            target: string;
            attributes: Record<string, unknown>;
        }>,
        options?: Record<string, unknown>,
    ): Promise<T> {
        this.notifier.show(`Mobile: Running graph analysis on main thread (limited to ${MOBILE_NODE_LIMIT} nodes)...`);

        // WR-01: Improve truncation by sorting by mtime (most recent first) if available
        let truncatedNodes = nodes;
        if (nodes.length > MOBILE_NODE_LIMIT) {
            const fileStats = options?.fileStats as Record<string, { mtime: number }> | undefined;
            if (fileStats) {
                // Clone and sort descending by mtime
                truncatedNodes = [...nodes].sort((a, b) => {
                    const mtimeA = fileStats[a.key]?.mtime || 0;
                    const mtimeB = fileStats[b.key]?.mtime || 0;
                    return mtimeB - mtimeA;
                });
            }
            truncatedNodes = truncatedNodes.slice(0, MOBILE_NODE_LIMIT);
        }

        const nodeKeys = new Set(truncatedNodes.map((n) => n.key));

        // Filter edges to only include those where both source and target exist in truncated set
        const filteredEdges = edges.filter((e) => nodeKeys.has(e.source) && nodeKeys.has(e.target));

        const requestId = `req_${Date.now()}_${this.requestId++}`;
        const message = {
            type,
            payload: { nodes: truncatedNodes, edges: filteredEdges, requestId },
            options,
        } as WorkerMessage;

        return new Promise<T>((resolve, reject) => {
            const deferFn = (cb: () => void) => {
                if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
                    (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(cb);
                } else {
                    setTimeout(cb, 100);
                }
            };

            deferFn(() => {
                try {
                    const response = handleGraphWorkerMessage(message);
                    if (response.type === 'ERROR') {
                        reject(new Error(response.payload?.message || 'Unknown error'));
                    } else if (response.type === 'RESULT') {
                        resolve(response.payload?.data as T);
                    } else {
                        reject(new Error(`Unexpected response type from fallback: ${response.type}`));
                    }
                } catch (err) {
                    reject(err instanceof Error ? err : new Error(String(err)));
                }
            });
        });
    }

    /**
     * Terminate the worker and clear all pending requests.
     * Revokes the blob URL to free memory.
     */
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

    /**
     * Completely shuts down the worker service.
     */
    destroy(): void {
        this.terminate();
        this.logger.info('GraphWorkerService destroyed');
    }
}
