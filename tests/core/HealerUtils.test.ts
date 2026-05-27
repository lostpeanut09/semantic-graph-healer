import { describe, it, expect } from 'vitest';
import { formatRagPrompt, formatIncongruencePrompt } from '../../src/core/HealerUtils';

describe('HealerUtils Prompt Sanitization', () => {
    const secretSnippet = 'My secret key is sk-1234567890abcdefghijklmnopqrstuvwxyz and my password is secret123';

    it('should mask secrets in formatRagPrompt', () => {
        const result = formatRagPrompt('Note1', 'tag1', 5, secretSnippet);
        expect(result).toContain('sk-***');
        expect(result).not.toContain('sk-1234567890abcdefghijklmnopqrstuvwxyz');
        // Note: 'password' is not masked by maskSecrets string regex unless it matches a pattern, 
        // but it might be handled if it was an object key in redactObject.
        // maskSecrets only handles Bearer, JWT, Hex keys, and sk- keys.
    });

    it('should mask secrets in formatIncongruencePrompt', () => {
        const result = formatIncongruencePrompt('Note1', 'prop1', ['v1', 'v2'], secretSnippet);
        expect(result).toContain('sk-***');
        expect(result).not.toContain('sk-1234567890abcdefghijklmnopqrstuvwxyz');
    });

    it('should handle Bearer tokens in prompts', () => {
        const bearerSnippet = 'Use Bearer my-secret-token-1234567890';
        const result = formatRagPrompt('Note1', 'tag1', 1, bearerSnippet);
        expect(result).toContain('Bearer ***');
    });
});
