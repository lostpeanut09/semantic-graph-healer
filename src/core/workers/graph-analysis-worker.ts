/**
 * Graph Analysis Worker
 * 
 * Entry point for the graph analysis web worker.
 * Orchestrates messages between the main thread and the Graph Analysis Core algorithms.
 * Handles progress reporting and result delivery back to the main thread.
 */

import {
    handleGraphWorkerMessage,
    createProgressReporter,
    type WorkerMessage,
    type WorkerResponse,
} from './graph-analysis-core';

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const message = e.data;
    // Safely wrap postMessage to satisfy type safety requirements
    const postMessageWrapper = (msg: WorkerResponse) => self.postMessage(msg);
    const reporter = createProgressReporter(postMessageWrapper);

    const response = handleGraphWorkerMessage(message, reporter);
    self.postMessage(response);
};
