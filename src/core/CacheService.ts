import { Plugin, normalizePath } from 'obsidian';
import { Suggestion, HistoryItem } from '../types';
import { HealerLogger } from './HealerUtils';

/**
 * CacheService: Manages volatile plugin state (suggestions, history) in a
 * separate file from data.json to prevent settings bloat.
 *
 * Pattern: Same as Breadcrumbs V4 and Dataview for data-heavy plugins.
 * History cap: 100 entries (Dashboard shows only last 5).
 *
 * Hardening (Apr 2026): Added atomic writes and single-writer promise chain
 * to prevent JSON truncation issues during power loss or concurrent writes.
 */

const CACHE_FILENAME = 'healer-cache.json';
const HISTORY_CAP = 100;
const SAVE_DEBOUNCE_MS = 500;

interface HealerCache {
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
    private _savePromise: Promise<void> = Promise.resolve();

    constructor(private plugin: Plugin) {
        const manifest = plugin.manifest as { dir?: string; id?: string };
        const pluginDir = manifest.dir ?? `.obsidian/plugins/${manifest.id ?? 'semantic-graph-healer'}`;
        this._cacheFilePath = normalizePath(`${pluginDir}/${CACHE_FILENAME}`);
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
                try {
                    const parsed = JSON.parse(raw) as Partial<HealerCache>;
                    this._cache = {
                        pendingSuggestions: Array.isArray(parsed.pendingSuggestions) ? parsed.pendingSuggestions : [],
                        history: Array.isArray(parsed.history) ? parsed.history : [],
                    };
                } catch (parseError) {
                    // PRESERVE CORRUPTION: Rename bad file instead of deleting
                    const corruptPath = `${this._cacheFilePath}.corrupt`;
                    HealerLogger.warn(`CacheService: JSON corrupted. Preserving to ${corruptPath}`);
                    if (await adapter.exists(corruptPath)) {
                        await adapter.remove(corruptPath);
                    }
                    await adapter.rename(this._cacheFilePath, corruptPath);
                    throw parseError; // Re-throw to trigger catch block reset
                }
                HealerLogger.info(
                    `CacheService: Loaded ${this._cache.pendingSuggestions.length} suggestions, ${this._cache.history.length} history entries from ${CACHE_FILENAME}.`,
                );
            } else if (legacySettings) {
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
     * Debounced save. Coalesces rapid writes into a single disk write.
     */
    save(): void {
        if (this._saveTimer) clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            this.saveImmediate().catch((e) => HealerLogger.error('CacheService: Debounced save failed.', e));
        }, SAVE_DEBOUNCE_MS);
    }

    /**
     * Immediate save. Uses atomic write pattern (temp + rename) and
     * single-writer promise chain to ensure consistency.
     */
    async saveImmediate(): Promise<void> {
        // Linear writing: each save waits for the previous one
        this._savePromise = this._savePromise
            .then(async () => {
                // Apply history cap
                if (this._cache.history.length > HISTORY_CAP) {
                    this._cache.history = this._cache.history.slice(-HISTORY_CAP);
                }

                const adapter = this.plugin.app.vault.adapter;
                const json = JSON.stringify(this._cache, null, 2);
                const tempPath = `${this._cacheFilePath}.tmp`;

                // 1. Write to temp file
                await adapter.write(tempPath, json);

                // 2. Try direct rename (atomicity window: minimal)
                // Obsidian/Electron/OS handles "rename-over-existing" in one step if possible.
                try {
                    await adapter.rename(tempPath, this._cacheFilePath);
                } catch (e) {
                    // 3. Fallback for systems/filesystems that block direct rename
                    HealerLogger.warn('CacheService: Direct rename failed, falling back to remove+rename.', e);
                    if (await adapter.exists(this._cacheFilePath)) {
                        await adapter.remove(this._cacheFilePath);
                    }
                    await adapter.rename(tempPath, this._cacheFilePath);
                }
            })
            .catch((e) => {
                HealerLogger.error('CacheService: Failed to write cache file.', e);
            });

        return this._savePromise;
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
