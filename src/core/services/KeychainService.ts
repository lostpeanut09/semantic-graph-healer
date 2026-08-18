import { HealerLogger } from '../utils/HealerLogger';
import { getProviderFromEndpoint } from '../HealerUtils';
import { isThenable } from '../HealerUtils';
import type { ExtendedApp, LegacyKeychain, ObsidianSecretStorage } from '../../types';
import type { KeychainContext } from './PluginContext';
import { CryptoUtils } from '../utils/CryptoUtils';

/**
 * Supported API key types for LLM providers and integrations.
 */
type ApiKeyType = 'openai' | 'anthropic' | 'deepseek' | 'infranodus' | 'custom';

/**
 * Interface for Obsidian Secure Storage (v1.11.4+)
 * Adapts both SecretStorage (Official) and Keychain (Legacy/UI)
 */
interface SecureStorage {
    /** Retrieves a secret by its key. */
    get(key: string): Promise<string | null>;
    /** Persists a secret with a unique key. */
    set(key: string, value: string): Promise<void>;
    /** Deletes a secret from storage. */
    delete(key: string): Promise<void>;
}

/**
 * Extended interface including optional deleteSecret for newer Obsidian versions.
 */
interface ObsidianSecretStorageWithDelete extends ObsidianSecretStorage {
    /** Native Obsidian method to delete a secret. */
    deleteSecret?(key: string): Promise<void> | void;
}

/**
 * Service responsible for managing secure storage of sensitive API keys and master keys.
 * Interfaces with Obsidian's native SecretStorage (v1.11.4+) or legacy Keychain,
 * and provides AES-256-GCM encrypted fallback for cross-device sync resilience.
 */
export class KeychainService {
    /** The active secure storage adapter. */
    private storage: SecureStorage | null = null;
    /** Reference to the Obsidian App. */
    private app: ExtendedApp;
    /** Flag indicating whether native secure storage is available on this platform. */
    private isSecureStorageAvailable: boolean = false;
    /** The dynamic master key used for the second layer of encryption. */
    private dynamicMasterKey: CryptoKey | null = null;
    /** Hardcoded key used for decrypting legacy keys during migration. */
    private readonly LEGACY_MASTER_KEY = 'semantic-healer-sota-2026';

    /**
     * Creates a new instance of KeychainService.
     *
     * @param context - The plugin context providing app access and settings.
     */
    constructor(private context: KeychainContext) {
        this.app = context.app as ExtendedApp;
        this.checkKeychainAvailability();
    }

    /**
     * Retrieves a stable salt for encryption, using a synced setting or a generated value.
     * Prioritizes synced settings to ensure cross-device compatibility.
     *
     * @returns A promise resolving to a stable string used as a salt for cryptographic operations.
     */
    private getStableSalt(): string {
        // 1. Try to use synced salt from settings (Primary for Sync)
        const settings = this.context.settings as unknown as Record<string, string | undefined>;
        const k = 'cryptoSalt';
        const existing = settings[k];
        if (typeof existing === 'string' && existing) return existing;

        // 2. Fallback to App ID if present (Local/Legacy)
        const appId = this.app.appId;
        if (typeof appId === 'string' && appId) {
            settings[k] = appId;
            void this.context.saveSettings();
            return appId;
        }

        // 3. Generate new stable salt
        const salt = `salt_${crypto.getRandomValues(new Uint32Array(1))[0].toString(16)}`;
        settings[k] = salt;
        void this.context.saveSettings();
        return salt;
    }

    /**
     * Checks if native SecretStorage or legacy Keychain is available.
     * Initializes the storage adapter accordingly.
     */
    private checkKeychainAvailability(): void {
        const app = this.app;

        // 1. Try Official SecretStorage (v1.11.4+)
        const ss = app.secretStorage;
        if (ss && typeof ss.getSecret === 'function') {
            this.storage = {
                get: (key: string) => Promise.resolve(ss.getSecret(key)),
                set: (key: string, val: string) => Promise.resolve(ss.setSecret(key, val)),
                delete: async (key: string) => {
                    const ssWithDelete = ss as ObsidianSecretStorageWithDelete;
                    if (ssWithDelete.deleteSecret && typeof ssWithDelete.deleteSecret === 'function') {
                        await ssWithDelete.deleteSecret(key);
                    }
                },
            };
            this.isSecureStorageAvailable = true;
            HealerLogger.info('Obsidian SecretStorage available (Official API v1.11.4+)');
            HealerLogger.info('Encryption Layer (AES-256-GCM) active via vault-id salt.');
            return;
        }

        // 2. Try Legacy Keychain (Pre-v1.11.4 or UI-only)
        const kc = app.keychain as LegacyKeychain;
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

    /**
     * Initializes the dynamic master key from secure storage or settings fallback.
     * Generates a new key if none exists. Ensures cross-device sync compatibility.
     *
     * @returns A promise that resolves when initialization is complete.
     */
    async initializeMasterKey(): Promise<void> {
        const keyName = 'sghealer-masterkey';
        let jwk: string | null = null;
        const salt = this.getStableSalt();

        // 1. Try to load from SecretStorage (Primary: Local-First security)
        if (this.isSecureStorageAvailable && this.storage) {
            try {
                jwk = await this.storage.get(keyName);
                if (jwk) HealerLogger.info('Master key found in SecretStorage.');
            } catch (e) {
                HealerLogger.error('Failed to read master key from SecretStorage.', e);
            }
        }

        // 2. Try to load from data.json fallback (Secondary: Sync-Resilience)
        if (!jwk) {
            const storedValue = this.context.settings.sghealerMasterKeyJWK || null;
            if (storedValue) {
                // SECURITY FIX: We still decrypt existing synced keys for backwards compatibility,
                // but we will no longer save new ones using the hardcoded key.
                jwk = await CryptoUtils.decrypt(storedValue, this.LEGACY_MASTER_KEY, salt);

                // Compatibility fallback: handle legacy plaintext JWK in settings
                if (!jwk && storedValue.includes('"kty":"oct"')) {
                    jwk = storedValue;
                    HealerLogger.info('Master key found in data.json (Legacy Plaintext).');
                } else if (jwk) {
                    HealerLogger.info('Master key recovered from data.json (Encrypted Sync Layer).');
                }
            }
        }

        if (jwk) {
            try {
                this.dynamicMasterKey = await CryptoUtils.importKey(jwk);
                HealerLogger.info('Dynamic master key loaded successfully.');
            } catch (e) {
                HealerLogger.error('Failed to import master key JWK. Key might be corrupted.', e);
                this.context.settings.keychainCorrupted = true;
                void this.context.saveSettings();
            }
        }

        // 3. Generate new key if still missing
        if (!this.dynamicMasterKey && !this.context.settings.keychainCorrupted) {
            HealerLogger.info('No master key found. Generating a new dynamic key.');
            this.dynamicMasterKey = await CryptoUtils.generateKey();
            jwk = await CryptoUtils.exportKey(this.dynamicMasterKey);
        }

        // 4. Persistence & Sync Propagation
        if (this.dynamicMasterKey && jwk) {
            // A. Save to Local Secure Storage
            if (this.isSecureStorageAvailable && this.storage) {
                try {
                    await this.storage.set(keyName, jwk);
                } catch (e) {
                    HealerLogger.error('Failed to save master key to SecretStorage.', e);
                }
            }

            // B. Removed insecure Sync-Resilient Storage
            // SECURITY FIX: Master key is no longer synced to prevent hardcoded secret vulnerability.
            try {
                if (this.context.settings.sghealerMasterKeyJWK) {
                    this.context.settings.sghealerMasterKeyJWK = undefined;
                    await this.context.saveSettings();
                    HealerLogger.info('Cleared insecure sync-resilient master key.');
                }
            } catch (e) {
                HealerLogger.error('Failed to clear insecure master key.', e);
            }
        }
    }

    /**
     * Migrates keys from legacy hardcoded key to the new dynamic key.
     * D-03
     */
    async migrateLegacyKeys(): Promise<boolean> {
        if (this.context.settings.keychainMigrationComplete) return false;
        if (!this.dynamicMasterKey) await this.initializeMasterKey();

        HealerLogger.info('Starting keychain migration to dynamic encryption...');
        const types: ApiKeyType[] = ['openai', 'anthropic', 'deepseek', 'infranodus', 'custom'];
        const salt = this.getStableSalt();
        let migratedAny = false;
        let failedAny = false;

        for (const type of types) {
            const storageKey = `semantic-graph-healer-${type}-key`;
            let plaintext: string | null = null;
            let foundLegacy = false;

            // 1. Try to get from storage (Double-Locked)
            if (this.isSecureStorageAvailable && this.storage) {
                const encVal = await this.storage.get(storageKey);
                if (encVal && encVal.startsWith('enc:')) {
                    foundLegacy = true;
                    plaintext = await CryptoUtils.decrypt(encVal.substring(4), this.LEGACY_MASTER_KEY, salt);
                }
            }

            // 2. Try to get from settings (Encrypted)
            if (!plaintext) {
                const settingsKey = `${type}LlmApiKeyEncrypted` as keyof typeof this.context.settings;
                const encVal = this.context.settings[settingsKey];
                if (encVal && typeof encVal === 'string') {
                    foundLegacy = true;
                    plaintext = await CryptoUtils.decrypt(encVal, this.LEGACY_MASTER_KEY, salt);
                }
            }

            if (plaintext) {
                // Re-encrypt with new dynamic key
                await this.setApiKey(type, plaintext);
                migratedAny = true;
                HealerLogger.info(`Migrated ${type} key to dynamic encryption.`);
            } else if (foundLegacy) {
                failedAny = true;
                HealerLogger.error(
                    `Failed to decrypt legacy ${type} key during migration. Salt or master key mismatch.`,
                );
            }
        }

        if (!failedAny) {
            this.context.settings.keychainMigrationComplete = true;
            await this.context.saveSettings();
            HealerLogger.info('Keychain migration complete.');
        } else {
            HealerLogger.warn('Keychain migration partially failed. Will retry on next boot.');
        }
        return migratedAny;
    }

    /**
     * Retrieves an API key from secure storage or sync-resilient settings.
     * Automatically handles decryption and legacy migration.
     * @param type - The type of API key to retrieve.
     * @returns A promise resolving to the plaintext API key, or null if not found.
     */
    async getApiKey(type: ApiKeyType): Promise<string | null> {
        if (!this.dynamicMasterKey) await this.initializeMasterKey();
        if (!this.dynamicMasterKey) return null; // Should not happen

        const storageKey = `semantic-graph-healer-${type}-key`;

        // Attempt 1: Secure Local Storage (Obsidian 1.11.4+)
        if (this.isSecureStorageAvailable && this.storage) {
            try {
                const key = await this.storage.get(storageKey);
                if (key) {
                    // SOTA 2026: Double-Layer Decryption (mitigate SecretStorage plaintext exploit v1.11.4)
                    if (key.startsWith('enc:')) {
                        const decrypted = await CryptoUtils.decrypt(key.substring(4), this.dynamicMasterKey);
                        if (decrypted) return decrypted;

                        // Decryption failed but we have data - potential key loss
                        this.handleDecryptionFailure();
                    }
                    return key; // Legacy fallback for unencrypted local keys
                }
            } catch (error) {
                HealerLogger.error(`Error reading SecretStorage for ${type}`, error);
            }
        }

        // Attempt 2: Sync-Resilient Encrypted Settings
        const settingsKey = `${type}LlmApiKeyEncrypted` as keyof typeof this.context.settings;
        const encrypted = this.context.settings[settingsKey];
        if (encrypted && typeof encrypted === 'string') {
            try {
                const decrypted = await CryptoUtils.decrypt(encrypted, this.dynamicMasterKey);
                if (decrypted) return decrypted;

                // Decryption failed but we have data - potential key loss
                this.handleDecryptionFailure();
            } catch (e) {
                HealerLogger.error(`Failed to decrypt sync-resilient key for ${type}`, e);
            }
        }

        // Attempt 3: Legacy Plaintext Settings (Migration Fallback)
        const settings = this.context.settings as unknown as Record<string, string | undefined>;

        // 3a. Check provider-specific legacy key (e.g. openaiLlmApiKey)
        let potentialKey = settings[`${type}LlmApiKey`];

        // 3b. Check generic legacy keys if they haven't been migrated yet
        if (!potentialKey) {
            const provider = getProviderFromEndpoint(this.context.settings.llmEndpoint);
            if (type === (provider === 'openai' ? 'openai' : provider)) {
                potentialKey = settings['llmApiKey'];
            }
            const secProvider = getProviderFromEndpoint(this.context.settings.secondaryLlmEndpoint);
            if (!potentialKey && type === (secProvider === 'openai' ? 'openai' : secProvider)) {
                potentialKey = settings['secondaryLlmApiKey'];
            }
        }

        if (potentialKey) {
            HealerLogger.warn(`API Key ${type} found in legacy plaintext settings. Migration triggered.`);
            // Auto-migrate: await encryption so plaintext is cleared only on success.
            try {
                await this.setApiKey(type, potentialKey);
                // Clear original legacy source
                if (settings[`${type}LlmApiKey`]) settings[`${type}LlmApiKey`] = '';
                if (settings['llmApiKey'] && potentialKey === settings['llmApiKey']) settings['llmApiKey'] = '';
                if (settings['secondaryLlmApiKey'] && potentialKey === settings['secondaryLlmApiKey'])
                    settings['secondaryLlmApiKey'] = '';

                await this.context.saveSettings();
            } catch (migErr) {
                HealerLogger.error(`Plaintext migration failed for ${type} — key retained in plaintext.`, migErr);
            }
            return potentialKey;
        }

        return null;
    }

    /**
     * Persists an API key securely using double-layer encryption.
     * Saves to both local SecretStorage and sync-resilient data.json.
     * @param type - The type of API key to store.
     * @param key - The plaintext API key content.
     */
    async setApiKey(type: ApiKeyType, key: string): Promise<void> {
        if (!this.dynamicMasterKey) await this.initializeMasterKey();
        if (!this.dynamicMasterKey) throw new Error('Keychain not initialized');

        const storageKey = `semantic-graph-healer-${type}-key`;

        // 1. Double-Layer Protection: SecretStorage (Local) + AES-256-GCM (Sync)

        // A. Secure Local Storage (Obsidian 1.11.4+)
        if (this.isSecureStorageAvailable && this.storage) {
            // FIX: Double-locking encryption layer (Obsidian SecretStorage plaintext bug mitigation)
            const encryptedForLocal = await CryptoUtils.encrypt(key, this.dynamicMasterKey);
            await this.storage.set(storageKey, `enc:${encryptedForLocal}`);
            HealerLogger.info(`API Key ${type} persisted to vault-local SecretStorage (Double-Locked).`);
        }

        // B. Sync-Resilient Storage (Encrypted in data.json)
        try {
            const encrypted = await CryptoUtils.encrypt(key, this.dynamicMasterKey);
            const settingsKey = `${type}LlmApiKeyEncrypted` as keyof typeof this.context.settings;

            // Use double-cast to access dynamic keys not in type's index signature
            const settings = this.context.settings as unknown as Record<string, string | undefined>;
            settings[settingsKey] = encrypted;

            await this.context.saveSettings();
            HealerLogger.info(`API Key ${type} persisted to sync-resilient encrypted storage.`);
        } catch (e) {
            HealerLogger.error(`Failed to encrypt API Key ${type} for sync.`, e);
        }
    }

    /**
     * Handles encryption/decryption failures by logging errors and flagging corruption.
     * Triggers the corruption recovery flow.
     */
    private handleDecryptionFailure(): void {
        HealerLogger.error('Decryption failed with dynamic master key. Key might be lost or corrupted.');
        // This will trigger the ResetKeychainModal via the UI layer or a notification
        // For now, we'll mark a flag to show it on next boot or UI interaction
        this.context.settings.keychainCorrupted = true;
        void this.context.saveSettings();

        if (this.context.onCorruptionDetected) {
            this.context.onCorruptionDetected();
        }
    }

    /**
     * Resets the keychain by clearing all keys and generating a new master key.
     * Used for recovery when the master key is lost or corrupted.
     *
     * @returns A promise that resolves when the reset is complete.
     */
    async resetKeychain(): Promise<void> {
        HealerLogger.info('Resetting keychain and generating new master key...');

        // 1. Clear existing dynamic key
        this.dynamicMasterKey = null;
        this.context.settings.sghealerMasterKeyJWK = undefined;
        this.context.settings.keychainCorrupted = false;

        const keyName = 'sghealer-masterkey';
        if (this.isSecureStorageAvailable && this.storage) {
            await this.storage.delete(keyName);
        }

        // 2. Clear all encrypted keys to avoid confusion
        const types: ApiKeyType[] = ['openai', 'anthropic', 'deepseek', 'infranodus', 'custom'];
        for (const type of types) {
            const settingsKey = `${type}LlmApiKeyEncrypted`;
            (this.context.settings as unknown as Record<string, unknown>)[settingsKey] = undefined;

            const storageKey = `semantic-graph-healer-${type}-key`;
            if (this.isSecureStorageAvailable && this.storage) {
                await this.storage.delete(storageKey);
            }
        }

        await this.context.saveSettings();

        // 3. Re-initialize with a fresh key
        await this.initializeMasterKey();
        HealerLogger.info('Keychain reset complete. New dynamic key generated.');
    }

    /**
     * Permanently deletes an API key from all storage locations.
     * @param type - The type of API key to delete.
     */
    async deleteApiKey(type: ApiKeyType): Promise<void> {
        const storageKey = `semantic-graph-healer-${type}-key`;

        if (this.isSecureStorageAvailable && this.storage) {
            await this.storage.delete(storageKey);
            HealerLogger.info(`API Key ${type} removed from secure storage`);
        }

        // Clean up settings: both plaintext (legacy) and encrypted (sync-resilient).
        // IMPORTANT: must clear encrypted field too — getApiKey() Attempt 2 reads
        // ${type}LlmApiKeyEncrypted and would still return the key if left intact.
        const settings = this.context.settings as unknown as Record<string, string | undefined>;
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
            await this.context.saveSettings();
        }
    }

    async migrateFromSettingsToKeychain(type: ApiKeyType): Promise<boolean> {
        const settings = this.context.settings as unknown as Record<string, string | undefined>;
        const settingsKey = settings[`${type}LlmApiKey`];

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
        await this.context.saveSettings();

        HealerLogger.info(`Migration for ${type} to secure storage completed`);
        return true;
    }

    /**
     * Checks whether the underlying platform provides native secure storage (e.g. Obsidian SecretStorage).
     *
     * @returns True if secure storage is available, false otherwise.
     */
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
            return {
                available: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }
}
