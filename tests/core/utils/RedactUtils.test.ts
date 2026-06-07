import { describe, it, expect } from 'vitest';
import { maskSecrets, sanitizeForLog, redactObject, SECRET_KEYS } from '../../../src/core/utils/RedactUtils';

describe('RedactUtils', () => {
    describe('maskSecrets', () => {
        it('should mask Bearer tokens', () => {
            const input = 'Authorization: Bearer my-secret-token-1234567890';
            expect(maskSecrets(input)).toBe('Authorization: Bearer ***');
        });

        it('should mask JWT tokens', () => {
            const jwt =
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoyNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
            expect(maskSecrets(`Token: ${jwt}`)).toContain('***JWT***');
        });

        it('should mask OpenAI-like sk- keys', () => {
            const input = 'key: sk-abcdefghijklmnopqrstuvwxyz0123456789';
            expect(maskSecrets(input)).toBe('key: sk-***');
        });

        it('should handle multiple secrets in one string', () => {
            const input = 'Bearer token-abc-123 and sk-1234567890abcdefghijklmnopqrstuvwxyz';
            const masked = maskSecrets(input);
            expect(masked).toBe('Bearer *** and sk-***');
        });
    });

    describe('sanitizeForLog', () => {
        it('should sanitize control characters', () => {
            const input = 'Line 1\nLine 2\tTab\u0000Null';
            const sanitized = sanitizeForLog(input);
            expect(sanitized).toBe('Line 1\\nLine 2\\tTab\\u0000Null');
        });

        it('should mask secrets and sanitize control chars together', () => {
            const input = 'Bearer my-token\nNext Line';
            const sanitized = sanitizeForLog(input);
            expect(sanitized).toBe('Bearer ***\\nNext Line');
        });
    });

    describe('redactObject', () => {
        it('should redact keys in SECRET_KEYS', () => {
            const data = {
                username: 'alice',
                password: 'password123',
                api_key: 'sk-123',
                nested: {
                    token: 'abc-456',
                    safe: 'ok',
                },
            };
            const redacted = redactObject(data) as {
                username: string;
                password: string;
                api_key: string;
                nested: { token: string; safe: string };
            };
            expect(redacted.username).toBe('alice');
            expect(redacted.password).toBe('***');
            expect(redacted.api_key).toBe('***');
            expect(redacted.nested.token).toBe('***');
            expect(redacted.nested.safe).toBe('ok');
        });

        it('should mask secrets within strings in objects', () => {
            const data = {
                description: 'Using Bearer my-token',
                safe_key: 'sk-1234567890abcdefghijklmnopqrstuvwxyz',
            };
            const redacted = redactObject(data) as {
                description: string;
                safe_key: string;
            };
            expect(redacted.description).toBe('Using Bearer ***');
            expect(redacted.safe_key).toBe('sk-***');
        });

        it('should handle circular references', () => {
            const a: { name: string; self?: unknown } = { name: 'a' };
            a.self = a;
            const redacted = redactObject(a) as { name: string; self: string };
            expect(redacted.name).toBe('a');
            expect(redacted.self).toBe('[Circular]');
        });

        it('should handle deep nesting', () => {
            const data = {
                a: {
                    b: {
                        c: {
                            password: 'secret',
                            d: {
                                token: 'sk-1234567890abcdefghijklmnopqrstuvwxyz',
                            },
                        },
                    },
                },
            };
            const redacted = redactObject(data) as {
                a: {
                    b: {
                        c: { password: string; d: { token: string } };
                    };
                };
            };
            expect(redacted.a.b.c.password).toBe('***');
            expect(redacted.a.b.c.d.token).toBe('***'); // 'token' is in SECRET_KEYS
        });

        it('should handle arrays of objects', () => {
            const data = [
                { id: 1, my_key: 'sk-1234567890abcdefghijklmnopqrstuvwxyz' },
                { id: 2, password: '123' },
            ];
            const redacted = redactObject(data) as Array<{
                id: number;
                my_key?: string;
                password?: string;
            }>;
            expect(redacted[0].my_key).toBe('sk-***'); // 'my_key' not in SECRET_KEYS, but value is masked
            expect(redacted[1].password).toBe('***');
        });

        it('should handle mixed content in arrays', () => {
            const data = ['safe', 'Bearer token123', { password: 'xyz' }];
            const redacted = redactObject(data) as Array<string | { password: string }>;
            expect(redacted[0]).toBe('safe');
            expect(redacted[1]).toBe('Bearer ***');
            expect((redacted[2] as { password: string }).password).toBe('***');
        });

        it('should handle BigInt', () => {
            const data = { val: BigInt(123) };
            const redacted = redactObject(data) as { val: string };
            expect(redacted.val).toBe('123n');
        });
    });

    describe('SECRET_KEYS', () => {
        it('should contain expected keys', () => {
            expect(SECRET_KEYS.has('openai_api_key')).toBe(true);
            expect(SECRET_KEYS.has('infranodus_token')).toBe(true);
            expect(SECRET_KEYS.has('password')).toBe(true);
        });
    });
});
