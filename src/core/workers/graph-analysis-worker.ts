// Dedicated worker bridge for heavy graph analysis
import { handleGraphWorkerMessage, WorkerMessage, WorkerResponse } from './graph-analysis-core';

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
    const message = e.data;
    const requestId = message.payload.requestId;

    const reporter = {
        postProgress: (requestId: string, pct: number, message: string) => {
            self.postMessage({
                type: 'PROGRESS',
                payload: { requestId, data: { pct, message } },
            } as unknown as WorkerResponse);
        },
    };

    const response = handleGraphWorkerMessage(message, reporter);
    self.postMessage(response);
};
