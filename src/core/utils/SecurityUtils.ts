// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeJsonParse<T = any>(json: string): T {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse(json, (key, value) => {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            return undefined;
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return value;
    });
}
