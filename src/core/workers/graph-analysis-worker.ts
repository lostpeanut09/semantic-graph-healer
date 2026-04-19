// Dedicated worker bridge for heavy graph analysis
import { handleGraphWorkerMessage, createProgressReporter, WorkerMessage } from './graph-analysis-core';

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const message = e.data;
    const reporter = createProgressReporter(self.postMessage.bind(self));

    const response = handleGraphWorkerMessage(message, reporter);
    self.postMessage(response);
};
