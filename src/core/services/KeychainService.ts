import { HealerLogger, isObsidianInternalApp } from '../HealerUtils';
import { isThenable } from '../HealerUtils';
import { ExtendedApp } from '../../types';
import SemanticGraphHealer from '../../main';
import { CryptoUtils } from '../utils/CryptoUtils';

type ApiKeyType = 'openai' | 'anthropic' | 'deepseek' | 'infranodus' | 'custom';

/**
 * Interface for Obsidian Secure Storage (v1.11.4+)
 * Adapts both SecretStorage (Official) and Keychain (Legacy/UI)
 */
interface SecureStorage {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
}

interface LegacyKeychain {
    get(key: string): string | null | Promise<string | null>;
    set(key: string, value: string): void | Promise<void>;
    delete(key: string): void | Promise<void>;
}

export class KeychainService {
    private storage: SecureStorage | null = null;
    private app: ExtendedApp;
    private isSecureStorageAvailable: boolean = false;
    private readonly MASTER_KEY = 'semantic-healer-sota-2026';

    constructor(private plugin: SemanticGraphHealer) {
        this.app = plugin.app as ExtendedApp;
        this.checkKeychainAvailability();
    }

    private checkKeychainAvailability(): void {
        const app = this.app;

        // 1. Try Official SecretStorage (v1.11.4+)
        const ss = app.secretStorage;
        if (ss && typeof ss.getSecret === 'function') {
            this.storage = {
                get: (key: string) => Promise.resolve(ss.getSecret(key)),
                set: (key: string, val: string) => Promise.resolve(ss.setSecret(key, val)),
                delete: async (key: string) => {
                    const ssAny = ss as unknown as Record<string, unknown>;
                    if (typeof ssAny.deleteSecret === 'function') {
                        await (ssAny.deleteSecret as (k: string) => Promise<void>)(key);
                    }
                },
            };
            this.isSecureStorageAvailable = true;
            HealerLogger.info('Obsidian SecretStorage available (Official API v1.11.4+)');
            HealerLogger.info('Encryption Layer (AES-256-GCM) active via vault-id salt.');
            return;
        }

        // 2. Try Legacy Keychain (Pre-v1.11.4 or UI-only)
        const kc = app.keychain as unknown as LegacyKeychain;
        if (kc && typeof kc.get === 'function') {
            this.storage = {
                get: (key: string) => Promise.resolve(kc.get(key)),
                set: (key: string, val: string) => Promise.resolve(kc.set(key, val)),
                delete: async (key: string) => {
                    const res = kc.delete(key);
                    if (isThenable(res)) await res;
                },
            };
            this.isSecureStorageAvailable = true;
            HealerLogger.info('Obsidian Keychain available (Legacy/UI Fallback)');
        } else {
            this.isSecureStorageAvailable = false;
            HealerLogger.warn('Secure storage NOT available - Obsidian version too old');
            HealerLogger.warn('API keys will be stored encrypted (AES-256-GCM) in data.json (sync-resilient).');
        }
    }

    async getApiKey(type: ApiKeyType): Promise<string | null> {
        const storageKey = `semantic-graph-healer-${type}-key`;
        const appId = isObsidianInternalApp(this.plugin.app) ? this.plugin.app.appId || 'default-salt' : 'default-salt';

        // Attempt 1: Secure Local Storage (Obsidian 1.11.4+)
        if (this.isSecureStorageAvailable && this.storage) {
            try {
                const key = await this.storage.get(storageKey);
                if (key) {
                    // SOTA 2026: Double-Layer Decryption (mitigate SecretStorage plaintext exploit v1.11.4)
                    if (key.startsWith('enc:')) {
                        const decrypted = await CryptoUtils.decrypt(key.substring(4), this.MASTER_KEY, appId);
                        if (decrypted) return decrypted;
                    }
                    return key; // Legacy fallback for unencrypted local keys
                }
            } catch (error) {
                HealerLogger.error(`Error reading SecretStorage for ${type}`, error);
            }
        }

        // Attempt 2: Sync-Resilient Encrypted Settings
        const settingsKey = `${type}LlmApiKeyEncrypted` as keyof typeof this.plugin.settings;
        const encrypted = this.plugin.settings[settingsKey];
        if (encrypted && typeof encrypted === 'string') {
            try {
                const decrypted = await CryptoUtils.decrypt(encrypted, this.MASTER_KEY, appId);
                if (decrypted) return decrypted;
            } catch (e) {
                HealerLogger.error(`Failed to decrypt sync-resilient key for ${type}`, e);
            }
        }

        // Attempt 3: Legacy Plaintext Settings (Migration Fallback)
        const settings = this.plugin.settings as unknown as Record<string, unknown>;
        const potentialKey = settings[`${type}LlmApiKey`] as string | undefined;
        if (potentialKey) {
            HealerLogger.warn(`API Key ${type} found in plaintext settings (INSECURE). Migration triggered.`);
            // Auto-migrate to secure storage if possible
            void this.setApiKey(type, potentialKey);
            return potentialKey;
        }

        return null;
    }

    async setApiKey(type: ApiKeyType, key: string): Promise<void> {
        const storageKey = `semantic-graph-healer-${type}-key`;
        const appId = isObsidianInternalApp(this.plugin.app) ? this.plugin.app.appId || 'default-salt' : 'default-salt';

        // 1. Double-Layer Protection: SecretStorage (Local) + AES-256-GCM (Sync)

        // A. Secure Local Storage (Obsidian 1.11.4+)
        if (this.isSecureStorageAvailable && this.storage) {
            // FIX: Double-locking encryption layer (Obsidian SecretStorage plaintext bug mitigation)
            const encryptedForLocal = await CryptoUtils.encrypt(key, this.MASTER_KEY, appId);
            await this.storage.set(storageKey, `enc:${encryptedForLocal}`);
            HealerLogger.info(`API Key ${type} persisted to vault-local SecretStorage (Double-Locked).`);
        }

        // B. Sync-Resilient Storage (Encrypted in data.json)
        try {
            const encrypted = await CryptoUtils.encrypt(key, this.MASTER_KEY, appId);
            const settingsKey = `${type}LlmApiKeyEncrypted` as keyof typeof this.plugin.settings;

            // Fixed: Intermediate unknown cast to bypass index signature constraint
            (this.plugin.settings as unknown as Record<string, string | undefined>)[settingsKey] = encrypted;

            await this.plugin.saveSettings();
            HealerLogger.info(`API Key ${type} persisted to sync-resilient encrypted storage.`);
        } catch (e) {
            HealerLogger.error(`Failed to encrypt API Key ${type} for sync.`, e);
        }
    }

    async deleteApiKey(type: ApiKeyType): Promise<void> {
        const storageKey = `semantic-graph-healer-${type}-key`;

        if (this.isSecureStorageAvailable && this.storage) {
            await this.storage.delete(storageKey);
            HealerLogger.info(`API Key ${type} removed from secure storage`);
        }

        // Clean up settings: both plaintext (legacy) and encrypted (sync-resilient).
        // IMPORTANT: must clear encrypted field too — getApiKey() Attempt 2 reads
        // ${type}LlmApiKeyEncrypted and would still return the key if left intact.
        const settings = this.plugin.settings as unknown as Record<string, unknown>;
        let changed = false;

        if (settings[`${type}LlmApiKey`]) {
            settings[`${type}LlmApiKey`] = '';
            changed = true;
        }

        if (settings[`${type}LlmApiKeyEncrypted`]) {
            settings[`${type}LlmApiKeyEncrypted`] = '';
            changed = true;
        }

        if (changed) {
            await this.plugin.saveSettings();
        }
    }

    async migrateFromSettingsToKeychain(type: ApiKeyType): Promise<boolean> {
        const settings = this.plugin.settings as unknown as Record<string, unknown>;
        const settingsKey = settings[`${type}LlmApiKey`] as string | undefined;

        if (!settingsKey) {
            HealerLogger.info(`No key to migrate for ${type}`);
            return false;
        }

        if (!this.isSecureStorageAvailable) {
            HealerLogger.warn('Secure storage not available - migration impossible');
            return false;
        }

        await this.setApiKey(type, settingsKey);

        // Clean up settings after migration
        settings[`${type}LlmApiKey`] = '';
        await this.plugin.saveSettings();

        HealerLogger.info(`Migration for ${type} to secure storage completed`);
        return true;
    }

    isSecure(): boolean {
        return this.isSecureStorageAvailable;
    }

    async validateKeychain(): Promise<{ available: boolean; error?: string }> {
        if (!this.isSecureStorageAvailable) {
            return { available: false, error: 'Secure storage API not available' };
        }

        try {
            // Test write/read
            const testKey = 'semantic-graph-healer:test';
            await this.storage!.set(testKey, 'test_value');
            const value = await this.storage!.get(testKey);
            await this.storage!.delete(testKey);

            if (value === 'test_value') {
                return { available: true };
            } else {
                return { available: false, error: 'Keychain test failed' };
            }
        } catch (error) {
            return { available: false, error: error instanceof Error ? error.message : String(error) };
        }
    }
}
