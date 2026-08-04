export function safeJsonParse(text: string): unknown {
    return JSON.parse(text, (key, value) => {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            return undefined;
        }
        return value as unknown;
    });
}
