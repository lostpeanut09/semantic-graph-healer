import { App, TFile } from 'obsidian';
import { DataviewPage, Suggestion } from '../types';
import { HealerLogger, isObsidianInternalApp, pathToWikilink, generateId } from './HealerUtils';

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

export interface VaultQueryEngine {
    getPage(path: string): DataviewPage | null;
    getPages(query: string): DataviewPage[];
    getBacklinks(path: string): string[];
}

/**
 * ADAPTER: Provides semantic integration with the Smart Connections plugin.
 */
export class SmartConnectionsAdapter {
    constructor(private app: App) {}

    private getPluginInstance(): SmartConnectionsPlugin | null {
        if (!isObsidianInternalApp(this.app)) return null;
        const plugins = (this.app as unknown as { plugins: ObsidianPluginRegistry }).plugins;
        return plugins.getPlugin('smart-connections') as SmartConnectionsPlugin;
    }

    public isAvailable(): boolean {
        const p = this.getPluginInstance();
        if (!p) return false;
        return !!(p.main?.smart_sources || p.smart_sources || p.env?.smart_sources || p.api);
    }

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
                        } as Suggestion;
                    });
            } catch (e) {
                const errMsg = e instanceof Error ? e.message : String(e);
                HealerLogger.error(`Smart Connections API call failed (${errMsg}), falling back to AJSON index.`, e);
            }
        }

        return this.querySmartEnvFallback(sourcePath, limit);
    }

    private async querySmartEnvFallback(sourcePath: string, limit: number): Promise<Suggestion[]> {
        const adapter = this.app.vault.adapter;
        const envCfgPath = '.smart-env/smart_env.json';
        if (!(await adapter.exists(envCfgPath))) return [];

        try {
            const cfgRaw = await adapter.read(envCfgPath);
            const cfg = JSON.parse(cfgRaw) as { smart_sources?: { single_file_data_path?: string } };

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
                    const targetBase = f.split('/').pop()?.replace('.ajson', '') || f;
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
                    } as Suggestion);
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
