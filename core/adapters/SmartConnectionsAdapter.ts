import { App, TFile } from 'obsidian';
import { IMetadataAdapter } from './IMetadataAdapter';
import { DataviewApi, DataviewPage, RelatedNote, HierarchyNode } from '../../types';
import { HealerLogger, isObsidianInternalApp, pathToWikilink } from '../HealerUtils';

interface SmartSources {
    search?: (path: string, options: { limit: number }) => Promise<SearchResult[]>;
    find?: (options: { query: string; limit: number }) => Promise<SearchResult[]>;
}

interface SearchResult {
    path?: string;
    item?: { path: string };
    score?: number;
}

interface SmartConnectionsApi {
    main?: { smart_sources?: SmartSources };
    smart_sources?: SmartSources;
    env?: { smart_sources?: SmartSources };
}

/**
 * SmartConnectionsAdapter: Semantic Similarity Logic.
 * SOTA 2026 Strategy: Support V3 and V4 connections without core dependency.
 */
export class SmartConnectionsAdapter implements IMetadataAdapter {
    constructor(private app: App) {}

    private getApi(): SmartConnectionsApi | null {
        if (!isObsidianInternalApp(this.app)) return null;
        const plugins = this.app.plugins;
        if (!plugins || typeof plugins.getPlugin !== 'function') return null;
        const plugin = plugins.getPlugin('smart-connections');
        return plugin && typeof plugin === 'object' ? (plugin as unknown as SmartConnectionsApi) : null;
    }

    getPage(path: string): DataviewPage | null {
        return null; // Similarity-provider
    }

    public invalidateBacklinkIndex() {}

    public getPages(query: string): DataviewPage[] {
        return [];
    }

    public getBacklinks(path: string): string[] {
        return [];
    }

    public getDataviewApi(): DataviewApi | null {
        return null;
    }

    queryPages(_query: string): Promise<DataviewPage[]> {
        return Promise.resolve([]); // Similarity-provider
    }

    getHierarchy(_path: string): Promise<HierarchyNode | null> {
        return Promise.resolve(null); // Similarity-provider
    }

    async getRelatedNotes(path: string, limit: number): Promise<RelatedNote[]> {
        const sc = this.getApi();
        if (!sc) return [];

        const smartSources = sc.main?.smart_sources ?? sc.smart_sources ?? sc.env?.smart_sources ?? null;

        if (smartSources && typeof smartSources === 'object') {
            try {
                let results: SearchResult[] = [];
                if (typeof smartSources.search === 'function') {
                    results = await smartSources.search(path, { limit: limit + 1 });
                } else if (typeof smartSources.find === 'function') {
                    results = await smartSources.find({ query: path, limit: limit + 1 });
                } else {
                    return this.queryAjsonFallback(path, limit);
                }

                return (Array.isArray(results) ? results : [])
                    .filter((res: SearchResult) => {
                        const targetPath = res.path ?? res.item?.path;
                        return targetPath && targetPath !== path;
                    })
                    .slice(0, limit)
                    .map((res: SearchResult) => {
                        const targetPath = res.path ?? res.item?.path;
                        const finalPath = targetPath || '';
                        return {
                            path: finalPath,
                            score: res.score || 0,
                            link: pathToWikilink(this.app, finalPath, path),
                        };
                    });
            } catch (e) {
                HealerLogger.error(`SmartConnectionsAdapter: API call failed for ${path}`, e);
            }
        }

        return this.queryAjsonFallback(path, limit);
    }

    invalidate(path?: string): void {
        // SC manages its own embeddings
    }

    private async queryAjsonFallback(sourcePath: string, limit: number): Promise<RelatedNote[]> {
        const envPath = '.smart-env/multi';
        const adapter = this.app.vault.adapter;
        if (!(await adapter.exists(envPath))) return [];

        try {
            const files = await adapter.list(envPath);
            const ajsonFiles = files.files.filter((f) => f.endsWith('.ajson'));
            const suggestions: RelatedNote[] = [];
            for (const f of ajsonFiles) {
                const content = await adapter.read(f);
                if (content.includes(`"${sourcePath}"`)) {
                    const targetBase = f.split('/').pop()?.replace('.ajson', '') || f;
                    const targetFile = this.app.metadataCache.getFirstLinkpathDest(targetBase, sourcePath);

                    let link = `[[${targetBase}]]`;
                    if (targetFile instanceof TFile) {
                        link = `[[${this.app.metadataCache.fileToLinktext(targetFile, sourcePath, true)}]]`;
                    }

                    suggestions.push({
                        path: targetFile?.path || f,
                        score: 0.5, // Standard fallback score
                        link: link,
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
