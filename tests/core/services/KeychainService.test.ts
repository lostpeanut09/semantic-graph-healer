import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeychainService } from '../../../src/core/services/KeychainService';
import { CryptoUtils } from '../../../src/core/utils/CryptoUtils';
import { DEFAULT_SETTINGS, type SemanticGraphHealerSettings } from '../../../src/types';
import type { KeychainContext } from '../../../src/core/services/PluginContext';

// Mock HealerLogger to avoid console output during tests
vi.mock('../../../src/core/HealerUtils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/core/HealerUtils')>();
    return {
        ...actual,
        HealerLogger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        },
    };
});

type MockSecretStorage = {
    getSecret: ReturnType<typeof vi.fn>;
    setSecret: ReturnType<typeof vi.fn>;
    deleteSecret: ReturnType<typeof vi.fn>;
};

type MockApp = {
    appId: string;
    secretStorage: MockSecretStorage | null;
};

type MockContext = KeychainContext & {
    settings: SemanticGraphHealerSettings & Record<string, unknown>;
};

describe('KeychainService', () => {
    let service: KeychainService;
    let mockContext: MockContext;
    let mockApp: MockApp;
    let mockSecretStorage: MockSecretStorage;

    beforeEach(() => {
        vi.clearAllMocks();

        mockSecretStorage = {
            getSecret: vi.fn(),
            setSecret: vi.fn(),
            deleteSecret: vi.fn(),
        };

        mockApp = {
            appId: 'test-app-id',
            secretStorage: mockSecretStorage,
        };

        mockContext = {
            app: mockApp as unknown as KeychainContext['app'],
            settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as SemanticGraphHealerSettings & Record<string, unknown>,
            saveSettings: vi.fn().mockResolvedValue(undefined),
            onCorruptionDetected: vi.fn(),
        };

        service = new KeychainService(mockContext);
    });

    describe('initializeMasterKey', () => {
        it('should generate and save a new master key to SecretStorage AND to data.json (encrypted) for sync', async () => {
            mockSecretStorage.getSecret.mockResolvedValue(null);

            await service.initializeMasterKey();

            expect(mockSecretStorage.setSecret).toHaveBeenCalledWith('sghealer-masterkey', expect.any(String));
            // New behavior: mirrored to data.json for sync resilience
            expect(mockContext.settings.sghealerMasterKeyJWK).toBeDefined();
            expect(mockContext.settings.sghealerMasterKeyJWK).not.toContain('"kty":"oct"');
            expect(mockContext.saveSettings).toHaveBeenCalled();
        });

        it('should save to data.json only if SecretStorage is NOT available', async () => {
            mockApp.secretStorage = null; // Disable secret storage
            const serviceNoSS = new KeychainService(mockContext);

            await serviceNoSS.initializeMasterKey();

            expect(mockContext.settings.sghealerMasterKeyJWK).toBeDefined();
            expect(mockContext.saveSettings).toHaveBeenCalled();
        });

        it('should mirror master key from SecretStorage to data.json if missing in settings', async () => {
            const key = await CryptoUtils.generateKey();
            const jwk = await CryptoUtils.exportKey(key);
            mockSecretStorage.getSecret.mockResolvedValue(jwk);
            mockContext.settings.sghealerMasterKeyJWK = undefined;

            await service.initializeMasterKey();

            expect(mockSecretStorage.setSecret).toHaveBeenCalledWith('sghealer-masterkey', jwk);
            // Should now be mirrored to settings (encrypted)
            expect(mockContext.settings.sghealerMasterKeyJWK).toBeDefined();
            expect(mockContext.saveSettings).toHaveBeenCalled();
        });

        it('should flag corruption if JWK import fails', async () => {
            mockSecretStorage.getSecret.mockResolvedValue('invalid-jwk');

            await service.initializeMasterKey();

            expect(mockContext.settings.keychainCorrupted).toBe(true);
            expect(mockContext.saveSettings).toHaveBeenCalled();
        });
    });

    describe('migrateLegacyKeys', () => {
        it('should migrate keys from legacy hardcoded key to dynamic key', async () => {
            const plaintext = 'sk-legacy-key';
            const legacyMaster = 'semantic-healer-sota-2026';
            const salt = 'test-app-id';
            const encrypted = await CryptoUtils.encrypt(plaintext, legacyMaster, salt);

            // Setup legacy encrypted key in settings
            mockContext.settings.openaiLlmApiKeyEncrypted = encrypted;
            mockContext.settings.keychainMigrationComplete = false;

            // Ensure master key is initialized
            await service.initializeMasterKey();

            const migrated = await service.migrateLegacyKeys();

            expect(migrated).toBe(true);
            expect(mockContext.settings.keychainMigrationComplete).toBe(true);

            // Verify it was re-encrypted with the new key (which we don't know, so we check if it's different)
            expect(mockContext.settings.openaiLlmApiKeyEncrypted).not.toBe(encrypted);

            // Verify we can decrypt it with getApiKey
            const retrieved = await service.getApiKey('openai');
            expect(retrieved).toBe(plaintext);
        });
    });

    describe('getApiKey / setApiKey', () => {
        it('should securely store and retrieve an API key', async () => {
            const plaintext = 'sk-new-key';
            await service.initializeMasterKey();

            await service.setApiKey('anthropic', plaintext);

            // Should be in SecretStorage with enc: prefix
            expect(mockSecretStorage.setSecret).toHaveBeenCalledWith(
                'semantic-graph-healer-anthropic-key',
                expect.stringMatching(/^enc:/),
            );

            // Should be in settings encrypted
            expect(mockContext.settings.anthropicLlmApiKeyEncrypted).toBeDefined();
            expect(mockContext.settings.anthropicLlmApiKeyEncrypted).not.toBe(plaintext);

            const retrieved = await service.getApiKey('anthropic');
            expect(retrieved).toBe(plaintext);
        });

        it('should handle decryption failure by triggering corruption flow', async () => {
            await service.initializeMasterKey();

            // Manually corrupt the encrypted value in settings
            mockContext.settings.openaiLlmApiKeyEncrypted = 'short-and-invalid';

            const retrieved = await service.getApiKey('openai');

            expect(retrieved).toBeNull();
            expect(mockContext.settings.keychainCorrupted).toBe(true);
            expect(mockContext.onCorruptionDetected).toHaveBeenCalled();
        });
    });

    describe('resetKeychain', () => {
        it('should clear all keys and generate a new master key', async () => {
            // First initialize
            await service.initializeMasterKey();
            expect(mockSecretStorage.setSecret).toHaveBeenCalledWith('sghealer-masterkey', expect.any(String));
            const firstKeyJWK: unknown = mockSecretStorage.setSecret.mock.calls[0][1];

            await service.setApiKey('openai', 'some-key');

            // Reset
            vi.clearAllMocks();
            await service.resetKeychain();

            // Should delete old key and set a new one
            expect(mockSecretStorage.deleteSecret).toHaveBeenCalledWith('sghealer-masterkey');
            expect(mockSecretStorage.setSecret).toHaveBeenCalledWith('sghealer-masterkey', expect.any(String));
            const newKeyJWK: unknown = mockSecretStorage.setSecret.mock.calls.find(
                (c: [string, string]) => c[0] === 'sghealer-masterkey',
            )![1];
            expect(newKeyJWK).not.toBe(firstKeyJWK);

            expect(mockContext.settings.openaiLlmApiKeyEncrypted).toBeUndefined();
            expect(mockSecretStorage.deleteSecret).toHaveBeenCalledWith('semantic-graph-healer-openai-key');
            expect(mockContext.settings.keychainCorrupted).toBe(false);
        });
    });
});
