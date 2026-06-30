/**
 * SecurityUtils.ts
 */

/**
 * Safe JSON.parse wrapper that prevents prototype pollution by stripping
 * __proto__, constructor, and prototype keys during parsing.
 *
 * @param json - The raw JSON string to parse.
 * @returns The parsed object, typed as unknown.
 */
export function safeJsonParse(json: string): unknown {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return JSON.parse(json, (key, value) => {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            return undefined;
        }
        return value;
    });
}
