import { App, TFile, parseLinktext } from 'obsidian';
import { IMetadataAdapter } from './IMetadataAdapter';
import { DataviewApi, DataviewPage, RelatedNote, HierarchyNode } from '../../types';
import { HealerLogger, isObsidianInternalApp, pathToWikilink } from '../HealerUtils';

interface LegacyScApi {
    search?: (query: string, opts?: { limit?: number }) => Promise<SearchResult[]> | SearchResult[];
    find?: (opts: { query: string; limit: number }) => Promise<SearchResult[]> | SearchResult[];
}

interface SmartSources {
    search?: (input: string, options: { limit: number }) => Promise<SearchResult[]> | SearchResult[];
    find?: (options: { query: string; limit: number }) => Promise<SearchResult[]> | SearchResult[];
}

interface SearchResult {
    path?: string;
    item?: { path: string };
    score?: number;
}

interface SmartConnectionsPluginShape {
    api?: LegacyScApi;
    main?: { smart_sources?: SmartSources };
    smart_sources?: SmartSources;
    env?: { smart_sources?: SmartSources };
    instance?: {
        api?: LegacyScApi;
        main?: { smart_sources?: SmartSources };
        smart_sources?: SmartSources;
        env?: { smart_sources?: SmartSources };
    };
}

/**
 * SmartConnectionsAdapter: best-effort semantic similarity bridge.
 * Uses private / undocumented internals when available.
 * Falls back to heuristic Smart Environment file scanning.
 * Not guaranteed against public Smart Connections API stability.
 */
export class SmartConnectionsAdapter implements IMetadataAdapter {
    private semanticQueryCache = new Map<string, { mtime: number; query: string }>();

    constructor(private app: App) {}

    private getPluginShape(): SmartConnectionsPluginShape | null {
        if (!isObsidianInternalApp(this.app)) return null;
        const raw = this.app.plugins?.getPlugin?.('smart-connections');
        return raw && typeof raw === 'object' ? (raw as unknown as SmartConnectionsPluginShape) : null;
    }

    private getGlobalSmartSources(): SmartSources | null {
        const w = window as unknown as {
            smart_env?: {
                smart_sources?: SmartSources;
                env?: { smart_sources?: SmartSources };
                main?: { smart_sources?: SmartSources };
            };
        };
        const env = w.smart_env;
        if (!env) return null;
        return env.smart_sources ?? env.env?.smart_sources ?? env.main?.smart_sources ?? null;
    }

    private resolveSmartSources(plugin: SmartConnectionsPluginShape | null): SmartSources | null {
        if (!plugin) return null;
        return (
            plugin.main?.smart_sources ??
            plugin.smart_sources ??
            plugin.env?.smart_sources ??
            plugin.instance?.main?.smart_sources ??
            plugin.instance?.smart_sources ??
            plugin.instance?.env?.smart_sources ??
            null
        );
    }

    private resolveLegacyApi(plugin: SmartConnectionsPluginShape | null): LegacyScApi | null {
        return plugin?.api ?? plugin?.instance?.api ?? null;
    }

    private normalizeNotePath(path: string, sourcePath = ''): string {
        const { path: linkpath } = parseLinktext(path);
        const direct = this.app.vault.getAbstractFileByPath(linkpath);
        if (direct instanceof TFile) return direct.path;
        return this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath)?.path ?? linkpath;
    }

    getPage(_path: string): DataviewPage | null {
        return null;
    }

    public invalidateBacklinkIndex(): void {}

    public getPages(_query: string): DataviewPage[] {
        return [];
    }

    public getBacklinks(_path: string): string[] {
        return [];
    }

    public getDataviewApi(): DataviewApi | null {
        return null;
    }

    queryPages(_query: string): Promise<DataviewPage[]> {
        return Promise.resolve([]);
    }

    getHierarchy(_path: string): Promise<HierarchyNode | null> {
        return Promise.resolve(null);
    }

    invalidate(_path?: string): void {}

    public destroy(): void {
        this.semanticQueryCache.clear();
        HealerLogger.debug?.('SmartConnectionsAdapter destroyed.');
    }

    private async buildSemanticQuery(notePath: string): Promise<string> {
        const normalized = this.normalizeNotePath(notePath, notePath);
        const file = this.app.vault.getAbstractFileByPath(normalized);
        if (!(file instanceof TFile)) return normalized;

        const mtime = file.stat.mtime;
        const cached = this.semanticQueryCache.get(file.path);
        if (cached && cached.mtime === mtime) return cached.query;

        try {
            const fileContent = await this.app.vault.cachedRead(file);
            const head = fileContent.slice(0, 1500).trim();
            const query = (file.basename + ' ' + head).trim();
            this.semanticQueryCache.set(file.path, { mtime, query });
            return query;
        } catch {
            return normalized;
        }
    }

    private containsExactPath(content: string, sourcePath: string): boolean {
        const escaped = sourcePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp('"' + escaped + '"').test(content);
    }

    private async firstNonEmpty(
        contextPath: string,
        attempts: Array<{ label: string; run: () => Promise<SearchResult[] | undefined> }>,
    ): Promise<SearchResult[]> {
        for (const attempt of attempts) {
            try {
                const res = await attempt.run();
                if (Array.isArray(res) && res.length > 0) {
                    HealerLogger.debug?.(
                        `SmartConnectionsAdapter: using surface "${attempt.label}" for "${contextPath}"`,
                    );
                    return res;
                }
                HealerLogger.debug?.(
                    `SmartConnectionsAdapter: surface "${attempt.label}" returned no results for "${contextPath}"`,
                );
            } catch (e) {
                HealerLogger.debug?.(
                    `SmartConnectionsAdapter: surface "${attempt.label}" failed for "${contextPath}"`,
                    e,
                );
            }
        }
        return [];
    }

    private async runSmartSearch(notePath: string, limit: number): Promise<SearchResult[]> {
        const normalizedPath = this.normalizeNotePath(notePath, notePath);
        const semanticQuery = await this.buildSemanticQuery(normalizedPath);
        const searchLimit = limit + 2;

        const plugin = this.getPluginShape();
        const globalSources = this.getGlobalSmartSources();
        const pluginSources = this.resolveSmartSources(plugin);
        const legacyApi = this.resolveLegacyApi(plugin);

        return this.firstNonEmpty(normalizedPath, [
            {
                label: 'window.smart_env.search(path)',
                run: () =>
                    globalSources?.search
                        ? Promise.resolve(globalSources.search(normalizedPath, { limit: searchLimit }))
                        : Promise.resolve(undefined),
            },
            {
                label: 'window.smart_env.find(query)',
                run: () =>
                    globalSources?.find
                        ? Promise.resolve(globalSources.find({ query: semanticQuery, limit: searchLimit }))
                        : Promise.resolve(undefined),
            },
            {
                label: 'plugin.smart_sources.search(path)',
                run: () =>
                    pluginSources?.search
                        ? Promise.resolve(pluginSources.search(normalizedPath, { limit: searchLimit }))
                        : Promise.resolve(undefined),
            },
            {
                label: 'plugin.smart_sources.find(query)',
                run: () =>
                    pluginSources?.find
                        ? Promise.resolve(pluginSources.find({ query: semanticQuery, limit: searchLimit }))
                        : Promise.resolve(undefined),
            },
            {
                label: 'legacy api.search(query)',
                run: () =>
                    legacyApi?.search
                        ? Promise.resolve(legacyApi.search(semanticQuery, { limit: searchLimit }))
                        : Promise.resolve(undefined),
            },
            {
                label: 'legacy api.find(query)',
                run: () =>
                    legacyApi?.find
                        ? Promise.resolve(legacyApi.find({ query: semanticQuery, limit: searchLimit }))
                        : Promise.resolve(undefined),
            },
        ]);
    }

    async getRelatedNotes(path: string, limit: number): Promise<RelatedNote[]> {
        const normalizedSource = this.normalizeNotePath(path, path);

        try {
            const results = await this.runSmartSearch(normalizedSource, limit);

            if (results.length > 0) {
                const seen = new Set<string>();
                return results
                    .map((res) => {
                        const rawTarget = res.path ?? res.item?.path;
                        if (!rawTarget) return null;

                        const targetPath = this.normalizeNotePath(rawTarget, normalizedSource);
                        if (!targetPath || targetPath === normalizedSource) return null;
                        if (seen.has(targetPath)) return null;
                        if (!(this.app.vault.getAbstractFileByPath(targetPath) instanceof TFile)) return null;

                        seen.add(targetPath);
                        return {
                            path: targetPath,
                            score: res.score ?? 0,
                            link: pathToWikilink(this.app, targetPath, normalizedSource),
                        } satisfies RelatedNote;
                    })
                    .filter((x): x is RelatedNote => x !== null)
                    .slice(0, limit);
            }
        } catch (e) {
            HealerLogger.error('SmartConnectionsAdapter: search pipeline failed for ' + normalizedSource, e);
        }

        return this.queryAjsonFallback(normalizedSource, limit);
    }

    private async queryAjsonFallback(sourcePath: string, limit: number): Promise<RelatedNote[]> {
        const adapter = this.app.vault.adapter;
        const suggestions: RelatedNote[] = [];
        const seen = new Set<string>();

        const singleFileFallbacks = ['.smart-env/smart_sources.json', '.smart-env/smart_sources.ajson'];
        for (const singleFileFallback of singleFileFallbacks) {
            if (!(await adapter.exists(singleFileFallback))) continue;
            try {
                const content = await adapter.read(singleFileFallback);
                const data = JSON.parse(content) as Record<string, unknown>;
                const items = data.items && typeof data.items === 'object' ? data.items : data;

                for (const [targetKey, targetVal] of Object.entries(items as Record<string, unknown>)) {
                    if (targetKey === sourcePath) continue;
                    if (this.containsExactPath(JSON.stringify(targetVal), sourcePath)) {
                        const targetFile = this.app.metadataCache.getFirstLinkpathDest(targetKey, sourcePath);
                        if (!(targetFile instanceof TFile)) continue;
                        if (seen.has(targetFile.path)) continue;

                        seen.add(targetFile.path);
                        suggestions.push({
                            path: targetFile.path,
                            score: 0.5,
                            link: '[[' + this.app.metadataCache.fileToLinktext(targetFile, sourcePath, true) + ']]',
                        });
                        if (suggestions.length >= limit) return suggestions;
                    }
                }
                return suggestions;
            } catch (e) {
                HealerLogger.error('SmartConnectionsAdapter: failed reading ' + singleFileFallback, e);
            }
        }

        // Best-effort heuristic looking for Smart Environment multi-indexes, which
        // are undocumented and not formally guaranteed by the Smart Connections API.
        const envPaths = ['.smart-env/multi', '.smart-connections', '.smart-connections/multi'];

        for (const envPath of envPaths) {
            if (!(await adapter.exists(envPath))) continue;

            try {
                const files = await adapter.list(envPath);
                const ajsonFiles = files.files.filter((f) => f.endsWith('.ajson')).slice(0, 200); // Safety cap: avoid unbounded I/O on huge indexes

                for (const f of ajsonFiles) {
                    // Harden: ensure full vault-relative path for adapter.read()
                    const readPath = f.includes('/') ? f : `${envPath}/${f}`;
                    const content = await adapter.read(readPath);
                    if (!this.containsExactPath(content, sourcePath)) continue;

                    const targetBase =
                        f
                            .split('/')
                            .pop()
                            ?.replace(/\.ajson$/i, '') ?? '';
                    if (!targetBase) continue;

                    const targetFile = this.app.metadataCache.getFirstLinkpathDest(targetBase, sourcePath);
                    if (!(targetFile instanceof TFile)) continue;
                    if (targetFile.path === sourcePath) continue;
                    if (seen.has(targetFile.path)) continue;

                    seen.add(targetFile.path);
                    suggestions.push({
                        path: targetFile.path,
                        score: 0.5,
                        link: '[[' + this.app.metadataCache.fileToLinktext(targetFile, sourcePath, true) + ']]',
                    });

                    if (suggestions.length >= limit) return suggestions;
                }
            } catch (e) {
                HealerLogger.error('SmartConnectionsAdapter: AJSON fallback failed for dir ' + envPath, e);
            }
        }

        return suggestions;
    }
}
