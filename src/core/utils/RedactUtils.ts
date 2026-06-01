/**
 * RedactUtils.ts
 * Centralized utility for masking and redacting sensitive information (credentials, tokens, keys).
 * SOTA 2026 Security Standards.
 */

// 1) SOTA 2026: Blacklist of sensitive keys to redact from logs and data structures.
export const SECRET_KEYS = new Set([
    'apikey',
    'api_key',
    'token',
    'access_token',
    'refresh_token',
    'authorization',
    'bearer',
    'password',
    'pass',
    'secret',
    'client_secret',
    'privatekey',
    'private_key',
    'openai_api_key',
    'anthropic_api_key',
    'gemini_api_key',
    'infranodus_token',
    'session_id',
    'cookie',
    'llmapikey',
    'secondaryllmapikey',
    'infranodusapikey',
    'sghealermasterkeyjwk',
]);

/**
 * Checks if a key name represents a sensitive field.
 */
function isSensitiveKey(key: string): boolean {
    const lower = key.toLowerCase();
    return SECRET_KEYS.has(lower) || lower.endsWith('encrypted') || lower.includes('password');
}

/**
 * Masks sensitive patterns (Bearer, JWT, API keys) in raw strings.
 * Centralizes logic previously found in HealerLogger and HealerUtils.
 */
export function maskSecrets(s: string): string {
    if (!s) return '';

    // Mask Bearer tokens: Bearer <token>
    let masked = s.replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/gi, 'Bearer ***');

    // Mask JWT-like structures (starts with eyJ... contains dots, minimum length)
    masked = masked.replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{3,}\.[A-Za-z0-9_-]{3,}\b/g, '***JWT***');

    // Generic Hex-like API keys (approx 32-64 chars) - cautious to avoid false positives
    masked = masked.replace(/\b[a-f0-9]{32,64}\b/gi, '***HEX_KEY***');

    // Standard OpenAI key prefix: sk-
    masked = masked.replace(/\bsk-[A-Za-z0-9-]{32,}\b/g, 'sk-***');

    return masked;
}

/**
 * Neutralizes ALL control characters (ASCII 0x00-0x1F + 0x7F) to prevent log injection.
 * Also applies secret masking.
 */
export function sanitizeForLog(s: string): string {
    if (!s) return '';

    // Mask sensitive sequences before escaping control chars
    const masked = maskSecrets(s);

    // Escape Line Breaks first for readability
    let sanitized = masked.replace(/\r/g, '\\r').replace(/\n/g, '\\n');

    // Neutralize other control chars (including Tab, Null, etc.)
    // eslint-disable-next-line no-control-regex
    sanitized = sanitized.replace(/[\u0000-\u001F\u007F]/g, (ch) => {
        if (ch === '\t') return '\\t';
        return `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`;
    });

    return sanitized;
}

/**
 * Recursively walks an object and redacts keys found in SECRET_KEYS.
 * Also masks secrets in any strings found within the object.
 */
export function redactObject(data: unknown, seen = new WeakSet<object>()): unknown {
    if (data === null || data === undefined) return data;

    // Handle BigInt which JSON.stringify doesn't like - move before object check
    if (typeof data === 'bigint') {
        return data.toString() + 'n';
    }

    if (typeof data === 'string') {
        return maskSecrets(data);
    }

    if (typeof data !== 'object') {
        return data;
    }

    // Circular dependency protection
    if (seen.has(data)) {
        return '[Circular]';
    }
    seen.add(data);

    if (Array.isArray(data)) {
        return data.map((item) => redactObject(item, seen));
    }

    if (data instanceof Date) return data;
    if (data instanceof RegExp) return data.toString();
    if (data instanceof Error) {
        return {
            name: data.name,
            message: maskSecrets(data.message),
            stack: data.stack ? maskSecrets(data.stack) : undefined,
        };
    }
    if (data instanceof Set) {
        return Array.from(data).map((item) => redactObject(item, seen));
    }
    if (data instanceof Map) {
        const redactedMap: Record<string, unknown> = {};
        for (const [key, value] of data.entries()) {
            const strKey = String(key);
            if (isSensitiveKey(strKey)) {
                redactedMap[strKey] = '***';
            } else {
                redactedMap[strKey] = redactObject(value, seen);
            }
        }
        return redactedMap;
    }

    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
        if (isSensitiveKey(key)) {
            redacted[key] = '***';
        } else {
            redacted[key] = redactObject(value, seen);
        }
    }

    return redacted;
}
