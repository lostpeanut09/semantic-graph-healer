import { handleGraphWorkerMessage, createProgressReporter, WorkerMessage, WorkerResponse } from './graph-analysis-core';

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const message = e.data;
    // Safely wrap postMessage to satisfy type safety requirements
    const postMessageWrapper = (msg: WorkerResponse) => self.postMessage(msg);
    const reporter = createProgressReporter(postMessageWrapper);

    const response = handleGraphWorkerMessage(message, reporter);
    self.postMessage(response);
};
