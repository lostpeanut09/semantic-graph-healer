// Secure API Key management with Obsidian Keychain
import { Plugin } from 'obsidian';
import { HealerLogger } from '../utils/HealerLogger';

export type ApiKeyType = 'openai' | 'anthropic' | 'deepseek' | 'infranodus' | 'custom';

/**
 * Interface for Obsidian Secure Storage (v1.11.4+)
 * Adapts both SecretStorage (Official) and Keychain (Legacy/UI)
 */
interface SecureStorage {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
}

export class KeychainService {
    private storage: SecureStorage | null = null;
    private logger: HealerLogger;
    private plugin: Plugin;
    private isSecureStorageAvailable: boolean = false;

    constructor(plugin: Plugin, logger: HealerLogger) {
        this.plugin = plugin;
        this.logger = logger;
        this.checkKeychainAvailability();
    }

    private checkKeychainAvailability(): void {
        const app = this.plugin.app as any;

        // 1. Try Official SecretStorage (v1.11.4+)
        const ss = app.secretStorage;
        if (ss && typeof ss.getSecret === 'function') {
            this.storage = {
                get: (key) => ss.getSecret(key),
                set: (key, val) => ss.setSecret(key, val),
                delete: (key) => (ss.deleteSecret ? ss.deleteSecret(key) : ss.delete(key)),
            };
            this.isSecureStorageAvailable = true;
            this.logger.info('✅ Obsidian SecretStorage available (Official API v1.11.4+)');
            return;
        }

        // 2. Try Legacy Keychain (Pre-v1.11.4 or UI-only)
        const kc = app.keychain;
        if (kc && typeof kc.get === 'function') {
            this.storage = kc;
            this.isSecureStorageAvailable = true;
            this.logger.info('✅ Obsidian Keychain available (Legacy/UI Fallback)');
        } else {
            this.isSecureStorageAvailable = false;
            this.logger.warn('⚠️ Secure storage NOT available - Obsidian version too old');
            this.logger.warn('📦 API keys will be saved in data.json (plain text!)');
        }
    }

    async getApiKey(type: ApiKeyType): Promise<string | null> {
        const storageKey = `semantic-graph-healer:${type}:key`;

        // Attempt 1: Secure Storage (preferred)
        if (this.isSecureStorageAvailable && this.storage) {
            try {
                const key = await this.storage.get(storageKey);
                if (key) {
                    this.logger.debug(`API Key ${type} retrieved from Keychain`);
                    return key;
                }
            } catch (error) {
                this.logger.error(`Error reading Keychain for ${type}`, error);
            }
        }

        // Fallback 2: Settings (deprecated, warn user)
        // @ts-ignore - access to plugin settings
        const settingsKey = this.plugin.settings?.[`${type}LlmApiKey` as any];
        if (settingsKey) {
            this.logger.warn(`⚠️ API Key ${type} found in settings (INSECURE). Migrate to Keychain!`);
            return settingsKey;
        }

        return null;
    }

    async setApiKey(type: ApiKeyType, key: string): Promise<void> {
        const storageKey = `semantic-graph-healer:${type}:key`;

        if (this.isSecureStorageAvailable && this.storage) {
            await this.storage.set(storageKey, key);
            this.logger.info(`✅ API Key ${type} saved to secure storage`);
        } else {
            // Fallback: save to settings (with warning)
            // @ts-ignore
            this.plugin.settings[`${type}LlmApiKey`] = key;
            // @ts-ignore
            await this.plugin.saveSettings();
            this.logger.warn(`⚠️ API Key ${type} saved to settings (INSECURE)`);
        }
    }

    async deleteApiKey(type: ApiKeyType): Promise<void> {
        const storageKey = `semantic-graph-healer:${type}:key`;

        if (this.isSecureStorageAvailable && this.storage) {
            await this.storage.delete(storageKey);
            this.logger.info(`✅ API Key ${type} removed from secure storage`);
        }

        // Clean up settings as well if present
        // @ts-ignore
        if (this.plugin.settings?.[`${type}LlmApiKey`]) {
            // @ts-ignore
            this.plugin.settings[`${type}LlmApiKey`] = '';
            // @ts-ignore
            await this.plugin.saveSettings();
        }
    }

    async migrateFromSettingsToKeychain(type: ApiKeyType): Promise<boolean> {
        // @ts-ignore
        const settingsKey = this.plugin.settings?.[`${type}LlmApiKey` as any];

        if (!settingsKey) {
            this.logger.info(`No key to migrate for ${type}`);
            return false;
        }

        if (!this.isSecureStorageAvailable) {
            this.logger.warn('Secure storage not available - migration impossible');
            return false;
        }

        await this.setApiKey(type, settingsKey);

        // Clean up settings after migration
        // @ts-ignore
        this.plugin.settings[`${type}LlmApiKey`] = '';
        // @ts-ignore
        await this.plugin.saveSettings();

        this.logger.info(`✅ Migration for ${type} to secure storage completed`);
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
