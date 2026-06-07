import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HealerLogger } from '../../../src/core/utils/HealerLogger';
import { SECRET_KEYS } from '../../../src/core/utils/RedactUtils';
import type { Plugin } from 'obsidian';
import type { SemanticGraphHealerSettings } from '../../../src/types';

interface SafeStringifyable {
    safeStringify(data: unknown): string;
    formatLogLine(entry: { timestamp: string; level: string; module: string; message: string; data?: unknown }): string;
}

describe('HealerLogger Redaction Integration', () => {
    let logger: HealerLogger;

    beforeEach(() => {
        // Mock plugin and app
        const mockPlugin = {
            app: {
                vault: {
                    getAbstractFileByPath: vi.fn(),
                    create: vi.fn(),
                },
            },
        };
        logger = new HealerLogger(
            'TestModule',
            mockPlugin as unknown as Plugin,
            { logLevel: 'debug' } as unknown as SemanticGraphHealerSettings,
        );
    });

    it('should redact sensitive keys in data objects', () => {
        const data = {
            api_key: 'sk-1234567890abcdef',
            password: 'myPassword',
            safe: 'public data',
        };

        const result = (logger as unknown as SafeStringifyable).safeStringify(data);
        expect(result).toContain('"api_key":"***"');
        expect(result).toContain('"password":"***"');
        expect(result).toContain('"safe":"public data"');
    });

    it('should mask secrets in strings within data objects', () => {
        const data = {
            config: 'Use Bearer my-secret-token to authenticate',
        };

        const result = (logger as unknown as SafeStringifyable).safeStringify(data);
        expect(result).toContain('"config":"Use Bearer *** to authenticate"');
    });

    it('should handle newly added secret keys', () => {
        const data = {
            openai_api_key: 'sk-real-key-data',
            infranodus_token: 'token-123',
        };

        const result = (logger as unknown as SafeStringifyable).safeStringify(data);
        expect(result).toContain('"openai_api_key":"***"');
        expect(result).toContain('"infranodus_token":"***"');
    });

    it('should sanitize control characters in log messages', () => {
        const message = 'Attack\nVector\tAttempted';
        const entry = {
            timestamp: '2026-05-27',
            level: 'info',
            module: 'Test',
            message: message,
        };

        const result = (logger as unknown as SafeStringifyable).formatLogLine(entry);
        expect(result).toContain('Attack\\nVector\\tAttempted');
    });

    it('should mask secrets in the main log message', () => {
        const message = 'Failed with Bearer token-12345';
        const entry = {
            timestamp: '2026-05-27',
            level: 'error',
            module: 'Test',
            message: message,
        };

        const result = (logger as unknown as SafeStringifyable).formatLogLine(entry);
        expect(result).toContain('Failed with Bearer ***');
    });
});
