// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../../src/core/HealerUtils', () => ({
    HealerLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
    isObsidianInternalApp: vi.fn(() => true),
    isThenable: vi.fn((v: unknown) => v instanceof Promise),
}));

vi.mock('obsidian', () => ({ App: class MockApp {} }));

// CryptoUtils: deterministic stub (encrypt prepends 'ENC:', decrypt strips it)
vi.mock('../../../src/core/utils/CryptoUtils', () => ({
    CryptoUtils: {
        encrypt: vi.fn(async (plain: string) => `ENC:${plain}`),
        decrypt: vi.fn(async (cipher: string) => {
            if (cipher.startsWith('ENC:')) return cipher.slice(4);
            return null;
        }),
    },
}));

import { KeychainService } from '../../../src/core/services/KeychainService';
import type SemanticGraphHealer from '../../../src/main';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal plugin stub around a mutable settings object. */
function makePlugin(initial: Record<string, unknown> = {}): {
    plugin: SemanticGraphHealer;
    settings: Record<string, unknown>;
    saveSettings: ReturnType<typeof vi.fn>;
} {
    const settings: Record<string, unknown> = { ...initial };
    const saveSettings = vi.fn(async () => {});

    const plugin = {
        app: { appId: 'test-vault', secretStorage: null, keychain: null },
        settings,
        saveSettings,
    } as unknown as SemanticGraphHealer;

    return { plugin, settings, saveSettings };
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('KeychainService', () => {
    afterEach(() => vi.clearAllMocks());

    // ── deleteApiKey ──────────────────────────────────────────────────────────

    describe('deleteApiKey', () => {
        it('clears plaintext field and saves once', async () => {
            const { plugin, settings, saveSettings } = makePlugin({
                openaiLlmApiKey: 'plain-key',
            });
            const svc = new KeychainService(plugin);

            await svc.deleteApiKey('openai' as any);

            expect(settings['openaiLlmApiKey']).toBe('');
            expect(saveSettings).toHaveBeenCalledTimes(1);
        });

        it('clears encrypted field (Attempt 2) — regression for CRIT-1', async () => {
            const { plugin, settings, saveSettings } = makePlugin({
                openaiLlmApiKeyEncrypted: 'ENC:some-secret',
            });
            const svc = new KeychainService(plugin);

            await svc.deleteApiKey('openai' as any);

            expect(settings['openaiLlmApiKeyEncrypted']).toBe('');
            expect(saveSettings).toHaveBeenCalledTimes(1);
        });

        it('clears both fields in one saveSettings call', async () => {
            const { plugin, settings, saveSettings } = makePlugin({
                openaiLlmApiKey: 'plain-key',
                openaiLlmApiKeyEncrypted: 'ENC:some-secret',
            });
            const svc = new KeychainService(plugin);

            await svc.deleteApiKey('openai' as any);

            expect(settings['openaiLlmApiKey']).toBe('');
            expect(settings['openaiLlmApiKeyEncrypted']).toBe('');
            expect(saveSettings).toHaveBeenCalledTimes(1); // not twice
        });

        it('getApiKey returns null after deleteApiKey (Attempt 2 regression)', async () => {
            const { plugin, settings } = makePlugin({
                openaiLlmApiKeyEncrypted: 'ENC:my-secret',
            });
            const svc = new KeychainService(plugin);

            // Verify key is readable before delete
            const before = await svc.getApiKey('openai' as any);
            expect(before).toBe('my-secret');

            // Delete
            await svc.deleteApiKey('openai' as any);

            // Key must now be gone — Attempt 2 must not return stale value
            expect(settings['openaiLlmApiKeyEncrypted']).toBe('');
            const after = await svc.getApiKey('openai' as any);
            expect(after).toBeNull();
        });

        it('does not call saveSettings if no fields to clear', async () => {
            const { plugin, saveSettings } = makePlugin({});
            const svc = new KeychainService(plugin);

            await svc.deleteApiKey('openai' as any);

            expect(saveSettings).not.toHaveBeenCalled();
        });
    });

    // ── getApiKey: plaintext migration ────────────────────────────────────────

    describe('getApiKey – plaintext migration (MED-1 policy)', () => {
        it('returns key found in plaintext settings', async () => {
            const { plugin } = makePlugin({ openaiLlmApiKey: 'legacy-plain' });
            const svc = new KeychainService(plugin);

            const result = await svc.getApiKey('openai' as any);
            expect(result).toBe('legacy-plain');
        });

        it('clears plaintext field after successful migration to encrypted', async () => {
            const { plugin, settings } = makePlugin({ openaiLlmApiKey: 'legacy-plain' });
            const svc = new KeychainService(plugin);

            await svc.getApiKey('openai' as any);

            // Give the fire-and-forget setApiKey (now awaited internally) time to settle
            await new Promise((r) => setTimeout(r, 0));

            // After migration, plaintext should be gone
            expect(settings['openaiLlmApiKey']).toBe('');
        });
    });
});
