import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KeychainService } from '../../../src/core/services/KeychainService';
import { CryptoUtils } from '../../../src/core/utils/CryptoUtils';
import type { KeychainContext } from '../../../src/core/services/PluginContext';
import type { SemanticGraphHealerSettings } from '../../../src/types';

// Mock HealerLogger
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

describe('KeychainService Sync Regression', () => {
    let mockContextA: KeychainContext;
    let mockAppA: {
        appId: string;
        secretStorage: {
            getSecret: (k: string) => string | null;
            setSecret: (k: string, v: string) => void;
        };
    };
    let mockSecretStorageA: Map<string, string>;
    let settingsA: SemanticGraphHealerSettings;

    let mockContextB: KeychainContext;
    let mockAppB: {
        appId: string;
        secretStorage: {
            getSecret: (k: string) => string | null;
            setSecret: (k: string, v: string) => void;
        };
    };
    let mockSecretStorageB: Map<string, string>;
    let settingsB: SemanticGraphHealerSettings;

    beforeEach(() => {
        vi.clearAllMocks();

        // Device A setup
        settingsA = {
            keychainMigrationComplete: false,
            keychainCorrupted: false,
        } as unknown as SemanticGraphHealerSettings;
        mockSecretStorageA = new Map();
        mockAppA = {
            appId: 'device-A-app-id',
            secretStorage: {
                getSecret: (k: string) => mockSecretStorageA.get(k) ?? null,
                setSecret: (k: string, v: string) => mockSecretStorageA.set(k, v),
            },
        };
        mockContextA = {
            app: mockAppA as unknown as KeychainContext['app'],
            settings: settingsA,
            saveSettings: vi.fn().mockResolvedValue(undefined),
        };

        // Device B setup (shared settings)
        settingsB = settingsA; // Sync simulation
        mockSecretStorageB = new Map();
        mockAppB = {
            appId: 'device-B-app-id',
            secretStorage: {
                getSecret: (k: string) => mockSecretStorageB.get(k) ?? null,
                setSecret: (k: string, v: string) => mockSecretStorageB.set(k, v),
            },
        };
        mockContextB = {
            app: mockAppB as unknown as KeychainContext['app'],
            settings: settingsB,
            saveSettings: vi.fn().mockResolvedValue(undefined),
        };
    });

    it('should successfully perform legacy migration on Device B with synced salt', async () => {
        const legacyMaster = 'semantic-healer-sota-2026';
        const plaintext = 'sk-legacy';

        // Device A setup: generate salt and encrypt
        const serviceA = new KeychainService(mockContextA);
        // @ts-ignore - access private for test setup
        const saltA = serviceA.getStableSalt();
        const encrypted = await CryptoUtils.encrypt(plaintext, legacyMaster, saltA);

        settingsA.openaiLlmApiKeyEncrypted = encrypted;
        settingsA.keychainMigrationComplete = false;

        // Device B tries to migrate. It should use the synced saltA.
        const serviceB = new KeychainService(mockContextB);
        await serviceB.initializeMasterKey();

        const migrated = await serviceB.migrateLegacyKeys();

        expect(migrated).toBe(true);
        expect(settingsB.keychainMigrationComplete).toBe(true);

        const retrieved = await serviceB.getApiKey('openai');
        expect(retrieved).toBe(plaintext);
    });
});
