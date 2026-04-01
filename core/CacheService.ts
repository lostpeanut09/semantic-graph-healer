import { Plugin } from 'obsidian';
import { Suggestion, HistoryItem } from '../types';
import { HealerLogger } from './HealerUtils';

/**
 * CacheService: Manages volatile plugin state (suggestions, history) in a
 * separate file from data.json to prevent settings bloat.
 *
 * Why: data.json is loaded/saved by Obsidian's Plugin.loadData/saveData
 * on every settings change. Storing growing arrays there degrades performance
 * for large vaults with frequent scans. This service writes to a dedicated
 * healer-cache.json file using vault.adapter (required for .obsidian/ access).
 *
 * Pattern: Same as Breadcrumbs V4 and Dataview for data-heavy plugins.
 *
 * History cap: 100 entries (Dashboard shows only last 5).
 */

const CACHE_FILENAME = 'healer-cache.json';
const HISTORY_CAP = 100;
const SAVE_DEBOUNCE_MS = 500;

export interface HealerCache {
    pendingSuggestions: Suggestion[];
    history: HistoryItem[];
}

const DEFAULT_CACHE: HealerCache = {
    pendingSuggestions: [],
    history: [],
};

export class CacheService {
    private _cache: HealerCache = { ...DEFAULT_CACHE, pendingSuggestions: [], history: [] };
    private _saveTimer: ReturnType<typeof setTimeout> | null = null;
    private _cacheFilePath: string;

    constructor(private plugin: Plugin) {
        const manifest = plugin.manifest as { dir?: string };
        const pluginDir = manifest.dir ?? '';
        this._cacheFilePath = `${pluginDir}/${CACHE_FILENAME}`;
    }

    // ─── Public Accessors ───────────────────────────────────────────────────────

    get suggestions(): Suggestion[] {
        return this._cache.pendingSuggestions;
    }

    set suggestions(value: Suggestion[]) {
        this._cache.pendingSuggestions = value;
    }

    get history(): HistoryItem[] {
        return this._cache.history;
    }

    // ─── Core Operations ────────────────────────────────────────────────────────

    /**
     * Load cache from disk. On first run, transparently migrates data from
     * data.json (legacy location) if present.
     */
    async load(legacySettings?: { pendingSuggestions?: Suggestion[]; history?: HistoryItem[] }): Promise<void> {
        try {
            const adapter = this.plugin.app.vault.adapter;
            const exists = await adapter.exists(this._cacheFilePath);

            if (exists) {
                const raw = await adapter.read(this._cacheFilePath);
                const parsed = JSON.parse(raw) as Partial<HealerCache>;
                this._cache = {
                    pendingSuggestions: Array.isArray(parsed.pendingSuggestions) ? parsed.pendingSuggestions : [],
                    history: Array.isArray(parsed.history) ? parsed.history : [],
                };
                HealerLogger.info(
                    `CacheService: Loaded ${this._cache.pendingSuggestions.length} suggestions, ${this._cache.history.length} history entries from ${CACHE_FILENAME}.`,
                );
            } else if (legacySettings) {
                // MIGRATION: First run after upgrade — pull data from data.json
                HealerLogger.info('CacheService: Migrating suggestions/history from data.json to healer-cache.json...');
                this._cache = {
                    pendingSuggestions: legacySettings.pendingSuggestions ?? [],
                    history: legacySettings.history ?? [],
                };
                await this.saveImmediate();
                HealerLogger.info(
                    `CacheService: Migration complete. ${this._cache.pendingSuggestions.length} suggestions, ${this._cache.history.length} history entries moved.`,
                );
            } else {
                HealerLogger.info('CacheService: No cache file found, starting fresh.');
                this._cache = { pendingSuggestions: [], history: [] };
            }
        } catch (e) {
            HealerLogger.error('CacheService: Failed to load cache, starting fresh.', e);
            this._cache = { pendingSuggestions: [], history: [] };
        }
    }

    /**
     * Debounced save. Coalesces rapid writes (e.g., batch suggestion updates)
     * into a single disk write after SAVE_DEBOUNCE_MS.
     */
    save(): void {
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            this.saveImmediate().catch((e) => HealerLogger.error('CacheService: Debounced save failed.', e));
        }, SAVE_DEBOUNCE_MS);
    }

    /**
     * Immediate save. Used for critical writes (e.g., before plugin unload).
     * Applies history cap before writing.
     */
    async saveImmediate(): Promise<void> {
        try {
            // Apply history cap
            if (this._cache.history.length > HISTORY_CAP) {
                this._cache.history = this._cache.history.slice(-HISTORY_CAP);
            }

            const adapter = this.plugin.app.vault.adapter;
            const json = JSON.stringify(this._cache, null, 2);
            await adapter.write(this._cacheFilePath, json);
        } catch (e) {
            HealerLogger.error('CacheService: Failed to write cache file.', e);
        }
    }

    /**
     * Push a history entry and trigger a debounced save.
     */
    pushHistory(item: HistoryItem): void {
        this._cache.history.push(item);
        this.save();
    }

    /**
     * Cleanup: flush pending writes on plugin unload.
     */
    async destroy(): Promise<void> {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }
        await this.saveImmediate();
    }
}
