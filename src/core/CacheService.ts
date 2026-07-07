import { safeJsonParse } from "./utils/SecurityUtils";
import { Plugin, normalizePath } from 'obsidian';
import type { Suggestion, HistoryItem, TopologicalMetrics } from '../types';
import { HealerLogger } from './utils/HealerLogger';

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
    topologicalScores: TopologicalMetrics;
    vectorEmbeddings: Record<string, { vector: number[]; hash: string }>;
}

const DEFAULT_CACHE: HealerCache = {
    pendingSuggestions: [],
    history: [],
    topologicalScores: {
        pageRank: {},
        betweenness: {},
        communities: {},
        lastAnalysisTimestamp: 0,
        graphVersion: '',
    },
    vectorEmbeddings: {},
};

export class CacheService {
    private _cache: HealerCache = {
        ...DEFAULT_CACHE,
    };
    private _saveTimer: ReturnType<typeof setTimeout> | null = null;
    private _cacheFilePath: string;
    private _savePromise: Promise<void> = Promise.resolve();

    /**
     * Initializes the CacheService.
     * @param plugin - The Obsidian plugin instance.
     */
    constructor(private plugin: Plugin) {
        const manifest = plugin.manifest as { dir?: string; id?: string };
        const pluginDir = manifest.dir ?? `.obsidian/plugins/${manifest.id ?? 'semantic-graph-healer'}`;
        this._cacheFilePath = normalizePath(`${pluginDir}/${CACHE_FILENAME}`);
    }

    // ─── Public Accessors ───────────────────────────────────────────────────────

    /**
     * Gets the list of pending suggestions.
     * @returns Array of pending suggestions.
     */
    get suggestions(): Suggestion[] {
        return this._cache.pendingSuggestions;
    }

    /**
     * Sets the list of pending suggestions.
     * @param value - Array of pending suggestions.
     */
    set suggestions(value: Suggestion[]) {
        this._cache.pendingSuggestions = value;
    }

    /**
     * Gets the history items.
     * @returns Array of history items.
     */
    get history(): HistoryItem[] {
        return this._cache.history;
    }

    /**
     * Gets the topological metrics scores.
     * @returns The topological metrics.
     */
    get topologicalScores(): TopologicalMetrics {
        return this._cache.topologicalScores;
    }

    /**
     * Sets the topological metrics scores.
     * @param value - The topological metrics.
     */
    set topologicalScores(value: TopologicalMetrics) {
        this._cache.topologicalScores = value;
    }

    /**
     * Gets the stored vector embeddings.
     * @returns A record of note paths to embeddings and their hashes.
     */
    get vectorEmbeddings(): Record<string, { vector: number[]; hash: string }> {
        return this._cache.vectorEmbeddings;
    }

    // ─── Core Operations ────────────────────────────────────────────────────────

    /**
     * Load cache from disk. On first run, transparently migrates data from
     * data.json (legacy location) if present.
     * @param legacySettings - Optional legacy settings to migrate from.
     * @returns A promise that resolves when loading is complete.
     * @throws Error if loading fails.
     */
    async load(legacySettings?: { pendingSuggestions?: Suggestion[]; history?: HistoryItem[] }): Promise<void> {
        try {
            const adapter = this.plugin.app.vault.adapter;
            const exists = await adapter.exists(this._cacheFilePath);

            if (exists) {
                const raw = await adapter.read(this._cacheFilePath);
                try {
                    const parsed = safeJsonParse(raw) as Partial<HealerCache>;
                    this._cache = {
                        pendingSuggestions: Array.isArray(parsed.pendingSuggestions) ? parsed.pendingSuggestions : [],
                        history: Array.isArray(parsed.history) ? parsed.history : [],
                        topologicalScores: parsed.topologicalScores || {
                            ...DEFAULT_CACHE.topologicalScores,
                        },
                        vectorEmbeddings:
                            parsed.vectorEmbeddings && typeof parsed.vectorEmbeddings === 'object'
                                ? parsed.vectorEmbeddings
                                : {},
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
                    topologicalScores: { ...DEFAULT_CACHE.topologicalScores },
                    vectorEmbeddings: {},
                };
                await this.saveImmediate();
                HealerLogger.info(
                    `CacheService: Migration complete. ${this._cache.pendingSuggestions.length} suggestions, ${this._cache.history.length} history entries moved.`,
                );
            } else {
                HealerLogger.info('CacheService: No cache file found, starting fresh.');
                this._cache = { ...DEFAULT_CACHE };
            }
        } catch (e) {
            HealerLogger.error('CacheService: Failed to load cache, starting fresh.', e);
            this._cache = { ...DEFAULT_CACHE };
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
     * @returns A promise that resolves when the save is complete.
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
     * Retrieves a stored embedding for a note if the hash matches.
     * @param notePath - The path to the note.
     * @param contentHash - The hash of the note content.
     * @returns The embedding vector if found and hash matches, null otherwise.
     */
    getStoredEmbedding(notePath: string, contentHash: string): number[] | null {
        const entry = this._cache.vectorEmbeddings[notePath];
        if (entry && entry.hash === contentHash) {
            return entry.vector;
        }
        return null;
    }

    /**
     * Stores an embedding for a note with its content hash.
     * @param notePath - The path to the note.
     * @param vector - The embedding vector.
     * @param contentHash - The hash of the note content.
     */
    storeEmbedding(notePath: string, vector: number[], contentHash: string): void {
        this._cache.vectorEmbeddings[notePath] = { vector, hash: contentHash };
        this.save();
    }

    /**
     * Push a history entry and trigger a debounced save.
     * @param item - The history item to add.
     */
    pushHistory(item: HistoryItem): void {
        this._cache.history.push(item);
        this.save();
    }

    /**
     * Cleanup: flush pending writes on plugin unload.
     * @returns A promise that resolves when cleanup is complete.
     */
    async destroy(): Promise<void> {
        if (this._saveTimer) {
            clearTimeout(this._saveTimer);
            this._saveTimer = null;
        }
        await this.saveImmediate();
    }
}
