import { App, TFile } from 'obsidian';
import { basename } from 'pathe';
import type { DataviewPage, Suggestion } from '../types';
import { HealerLogger } from './utils/HealerLogger';
import { isObsidianInternalApp, pathToWikilink, generateId } from './HealerUtils';
import { safeJsonParse } from './utils/SecurityUtils';

interface ObsidianPluginRegistry {
    getPlugin(id: string): unknown;
    enabledPlugins: Set<string>;
}

interface SmartConnectionsPlugin {
    main?: { smart_sources?: unknown };
    smart_sources?: unknown;
    env?: { smart_sources?: unknown };
    api?: unknown;
}

/**
 * VaultQueryEngine: Interface for querying the note vault, typically implemented
 * by Dataview or Datacore.
 */
export interface VaultQueryEngine {
    /**
     * Retrieves a page's metadata by its vault path.
     * @param path - The vault-relative path to the note.
     * @returns The page metadata or null if not found.
     */
    getPage(path: string): DataviewPage | null;

    /**
     * Retrieves a list of pages matching a specific query.
     * @param query - The query string (e.g., folder path).
     * @returns Array of matching pages.
     */
    getPages(query: string): DataviewPage[];

    /**
     * Retrieves all backlinks for a specific note.
     * @param path - The vault-relative path to the note.
     * @returns Array of paths of notes linking to the target note.
     */
    getBacklinks(path: string): string[];
}

/**
 * SmartConnectionsAdapter: Provides semantic integration with the Smart Connections plugin.
 * Handles different versions of Smart Connections API (v3/v4) and provides AJSON fallbacks.
 */
export class SmartConnectionsAdapter {
    /**
     * Initializes the SmartConnectionsAdapter.
     * @param app - The Obsidian App instance.
     */
    constructor(private app: App) {}

    /**
     * Retrieves the Smart Connections plugin instance from the internal registry.
     * @returns The plugin instance or null if not found/available.
     */
    private getPluginInstance(): SmartConnectionsPlugin | null {
        if (!isObsidianInternalApp(this.app)) return null;
        const plugins = (this.app as unknown as { plugins: ObsidianPluginRegistry }).plugins;
        return plugins.getPlugin('smart-connections') as SmartConnectionsPlugin;
    }

    /**
     * Checks if Smart Connections is available and has a functional API or environment.
     * @returns True if available, false otherwise.
     */
    public isAvailable(): boolean {
        const p = this.getPluginInstance();
        if (!p) return false;
        return !!(p.main?.smart_sources || p.smart_sources || p.env?.smart_sources || p.api);
    }

    /**
     * Queries Smart Connections for semantically similar notes.
     * @param sourcePath - The path of the note to find similarities for.
     * @param limit - Maximum number of suggestions to return.
     * @returns A promise resolving to an array of suggestions.
     */
    public async query(sourcePath: string, limit: number = 10): Promise<Suggestion[]> {
        const sc = this.getPluginInstance();
        if (!sc) return [];

        const smartSources = sc.main?.smart_sources ?? sc.smart_sources ?? sc.env?.smart_sources ?? null;

        if (smartSources) {
            try {
                let results: unknown[];

                type SearchableSource = {
                    search: (q: string, opts: unknown) => Promise<unknown[]>;
                    find: (opts: unknown) => Promise<unknown[]>;
                };
                const ss = smartSources as SearchableSource;

                if (typeof ss.search === 'function') {
                    HealerLogger.info(`Smart Connections v4: Querying .search() for ${sourcePath}`);
                    results = await ss.search(sourcePath, { limit: limit + 1 });
                } else if (typeof ss.find === 'function') {
                    HealerLogger.info(`Smart Connections v3: Querying .find() for ${sourcePath}`);
                    results = await ss.find({ query: sourcePath, limit: limit + 1 });
                } else {
                    const availableKeys = Object.keys(ss);
                    HealerLogger.warn(
                        `Smart Connections: API object found but missing .search/.find (Keys: ${availableKeys.join(', ')}). Falling back to AJSON.`,
                    );
                    return this.queryAjsonFallback(sourcePath, limit);
                }

                const resultsArray = (Array.isArray(results) ? results : []) as Record<string, unknown>[];
                return resultsArray
                    .filter((res) => {
                        const rawPath = res.path ?? (res.item as Record<string, unknown>)?.path;
                        const targetPath = typeof rawPath === 'string' ? rawPath : '';
                        return targetPath && targetPath !== sourcePath;
                    })
                    .slice(0, limit)
                    .map((res) => {
                        const rawPath = res.path ?? (res.item as Record<string, unknown>)?.path;
                        const targetPath = typeof rawPath === 'string' ? rawPath : '';
                        const scoreNum = typeof res.score === 'number' ? res.score : 0;
                        return {
                            id: `sc_match:${targetPath}`,
                            type: 'semantic' as const,
                            link: pathToWikilink(this.app, targetPath, sourcePath),
                            source: `Semantic similarity match (Score: ${scoreNum.toFixed(2)}) via Smart Connections.`,
                            timestamp: Date.now(),
                            category: 'info' as const,
                            meta: {
                                sourcePath: sourcePath,
                                targetPath: targetPath,
                                confidence: Math.round(scoreNum * 100),
                                description: 'Related concept found via vector embeddings.',
                            },
                        };
                    });
            } catch (e) {
                const errMsg = e instanceof Error ? e.message : String(e);
                HealerLogger.error(`Smart Connections API call failed (${errMsg}), falling back to AJSON index.`, e);
            }
        }

        return this.querySmartEnvFallback(sourcePath, limit);
    }

    /**
     * Fallback to searching Smart Environment configuration and AJSON files.
     * @param sourcePath - The path of the source note.
     * @param limit - Maximum number of suggestions.
     * @returns A promise resolving to an array of suggestions.
     */
    private async querySmartEnvFallback(sourcePath: string, limit: number): Promise<Suggestion[]> {
        const adapter = this.app.vault.adapter;
        const envCfgPath = '.smart-env/smart_env.json';
        if (!(await adapter.exists(envCfgPath))) return [];

        try {
            const cfgRaw = await adapter.read(envCfgPath);
            const cfg = safeJsonParse(cfgRaw) as {
                smart_sources?: { single_file_data_path?: string };
            };

            const smartSourcesPath: string | undefined = cfg.smart_sources?.single_file_data_path;
            if (smartSourcesPath && (await adapter.exists(smartSourcesPath))) {
                const sourcesRaw = await adapter.read(smartSourcesPath);
                if (sourcesRaw.includes(`"${sourcePath}"`)) {
                    HealerLogger.info('Smart Env fallback: structured correlation not available.');
                    return [];
                }
            }

            return this.queryAjsonFallback(sourcePath, limit);
        } catch (e) {
            HealerLogger.error('Smart Env fallback failed', e);
            return [];
        }
    }

    /**
     * Fallback to scanning .ajson files in .smart-env/multi.
     * @param sourcePath - The path of the source note.
     * @param limit - Maximum number of suggestions.
     * @returns A promise resolving to an array of suggestions.
     */
    private async queryAjsonFallback(sourcePath: string, limit: number): Promise<Suggestion[]> {
        const envPath = '.smart-env/multi';
        const adapter = this.app.vault.adapter;
        if (!(await adapter.exists(envPath))) return [];

        try {
            const files = await adapter.list(envPath);
            const ajsonFiles = files.files.filter((f) => f.endsWith('.ajson'));
            const suggestions: Suggestion[] = [];
            const MAX_SCAN = 20;
            let scanned = 0;

            for (const f of ajsonFiles) {
                if (scanned >= MAX_SCAN) break;
                scanned++;

                const content = await adapter.read(f);
                if (content.includes(`"${sourcePath}"`)) {
                    const targetBase = basename(f, '.ajson');
                    const targetFile = this.app.metadataCache.getFirstLinkpathDest(targetBase, sourcePath);

                    let link = `[[${targetBase}]]`;
                    if (targetFile instanceof TFile) {
                        link = `[[${this.app.metadataCache.fileToLinktext(targetFile, sourcePath, true)}]]`;
                    }

                    suggestions.push({
                        id: generateId('sc-ajson'),
                        type: 'semantic',
                        link: link,
                        source: 'Smart Connections legacy fallback (AJSON match).',
                        timestamp: Date.now(),
                        category: 'info',
                        meta: {
                            sourcePath,
                            targetPath: f,
                            description: 'Correlated via AJSON index.',
                            targetNote: targetBase,
                        },
                    });
                }
                if (suggestions.length >= limit) break;
            }
            return suggestions;
        } catch (e) {
            HealerLogger.error('AJSON fallback failed', e);
            return [];
        }
    }
}
