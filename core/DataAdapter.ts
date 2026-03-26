import { App, TFile } from 'obsidian';
import { DataviewApi, DataviewPage, DatacoreApi, MarkdownPage, Suggestion } from '../types';
import { HealerLogger, isObsidianInternalApp } from './HealerUtils';

/**
 * Production-grade implementation of VaultQueryEngine.
 * Hybrid engine: Datacore (Primary) -> Dataview (Fallback).
 */
export interface VaultQueryEngine {
    getPage(path: string): Promise<DataviewPage | null>;
    getPagesWithTag(tag: string): Promise<DataviewPage[]>;
    getBacklinks(path: string): Promise<string[]>;
}

export class VaultDataAdapter implements VaultQueryEngine {
    constructor(private app: App) {}

    // --- Type-safe API accessors ---
    public getDataviewApi(): DataviewApi | null {
        if (!isObsidianInternalApp(this.app)) return null;
        const plugin = this.app.plugins.getPlugin('dataview');
        if (!plugin || typeof plugin !== 'object' || !('api' in plugin)) return null;
        return (plugin as unknown as { api: DataviewApi }).api;
    }

    public getDatacoreApi(): DatacoreApi | null {
        if (!isObsidianInternalApp(this.app)) return null;
        const plugin = this.app.plugins.getPlugin('datacore');
        if (!plugin || typeof plugin !== 'object' || !('api' in plugin)) return null;
        return (plugin as unknown as { api: DatacoreApi }).api;
    }

    // --- VaultQueryEngine Implementation ---
    async getPage(path: string): Promise<DataviewPage | null> {
        // Priority: Datacore → Dataview → null
        const dc = this.getDatacoreApi();
        if (dc) {
            // FIX: Correct escape for Datacore (Double backslash for string literal)
            const safePath = path.replace(/"/g, '\\"');
            const page = dc.page(safePath);
            if (page) return this.mapMarkdownToDataview(page);
        }
        const dv = this.getDataviewApi();
        if (dv) return dv.page(path);
        return null;
    }

    async getPagesWithTag(tag: string): Promise<DataviewPage[]> {
        // Priority: Datacore → Dataview → empty
        const dc = this.getDatacoreApi();
        if (dc) {
            // FIX: Normalize tag and escape
            const cleanTag = tag.startsWith('#') ? tag : `#${tag}`;
            const safeTag = cleanTag.replace(/"/g, '\\"');

            // Query logic
            const query = tag ? `@page and ${safeTag}` : '@page';
            const results = dc.query<MarkdownPage>(query);
            return results.map((p) => this.mapMarkdownToDataview(p));
        }
        const dv = this.getDataviewApi();
        if (dv) return dv.pages(tag);
        return [];
    }

    async getBacklinks(path: string): Promise<string[]> {
        // Priority: Datacore (Indexed) → MetadataCache (Manual)
        const dc = this.getDatacoreApi();
        if (dc) {
            try {
                const safePath = path.replace(/"/g, '\\"');
                // Leverage Datacore's reverse index
                const results = dc.query<MarkdownPage>(`@page and links("${safePath}")`);
                return results.map((p) => p.$path.split('/').pop()?.replace(/\.md$/, '') || '');
            } catch (e) {
                HealerLogger.warn('Datacore backlink query failed, falling back to cache.', e);
            }
        }

        // Fallback: MetadataCache
        const cache = this.app.metadataCache.resolvedLinks;
        const backlinks: string[] = [];
        for (const [source, targets] of Object.entries(cache)) {
            if (targets[path]) {
                const sourceFile = this.app.vault.getAbstractFileByPath(source);
                if (sourceFile instanceof TFile) {
                    backlinks.push(sourceFile.basename);
                }
            }
        }
        return backlinks;
    }

    /**
     * CRITICAL ADAPTER: Maps Datacore schema to Legacy Dataview schema.
     * Generates a synthetic 'file.link' object to prevent crashes in legacy code.
     */
    private mapMarkdownToDataview(page: MarkdownPage): DataviewPage {
        const name = page.$path.split('/').pop() || '';
        const basename = name.replace(/\.md$/, '');

        return {
            ...page, // Spread user fields (frontmatter/inline fields)
            file: {
                path: page.$path,
                name: name,
                basename: basename,
                ctime: page.$ctime,
                mtime: page.$mtime,
                size: page.$size,
                tags: page.$tags,
                etags: page.$tags,
                link: {
                    path: page.$path,
                    display: basename,
                    embed: false,
                    type: 'file',
                    subpath: undefined,
                },
                outlinks: page.$links
                    ? (page.$links as unknown as { type: string; path: string }[])
                          .filter((l) => l.type === 'file')
                          .map((l) => l.path)
                    : [],
                frontmatter: page.$frontmatter || {}, // Legacy direct access
            },
            // Datacore puts fields at root, but legacy Dataview often looks directly
            ...page.$frontmatter,
        } as unknown as DataviewPage;
    }
}

/**
 * ADAPTER: Provides semantic integration with the Smart Connections plugin.
 */
export class SmartConnectionsAdapter {
    constructor(private app: App) {}

    public isAvailable(): boolean {
        // v4+: smart_env is globally accessible via window
        const env = (window as unknown as { smart_env?: { smart_sources?: { find: unknown } } }).smart_env;
        return !!(env && env.smart_sources);
    }

    public async query(path: string, limit: number = 10): Promise<Suggestion[]> {
        const env = (
            window as unknown as {
                smart_env?: {
                    smart_sources?: {
                        find: (o: {
                            query: string;
                            limit: number;
                        }) => Promise<{ path?: string; item?: { path: string }; score: number }[]>;
                    };
                };
            }
        ).smart_env;

        if (!env?.smart_sources?.find) {
            return [];
        }

        try {
            // SOTA 2026 API: env.smart_sources.find returns results with score and path
            const results = await env.smart_sources.find({ query: path, limit });
            return (results || []).map((res) => ({
                id: `sc_match:${res.path || res.item?.path}`,
                type: 'semantic' as const,
                link: `[[${res.path || res.item?.path}]]`,
                source: `Semantic similarity match (Score: ${res.score?.toFixed(2)}) via Smart Connections.`,
                timestamp: Date.now(),
                category: 'info' as const,
                meta: {
                    confidence: Math.round((res.score || 0) * 100),
                    description: 'Related concept found via vector embeddings.',
                },
            }));
        } catch (e) {
            HealerLogger.warn('Smart Connections runtime API failed, trying ajson fallback...', e);
            return this.queryAjsonFallback(path, limit);
        }
    }

    /**
     * Fallback: Read semantic data directly from .smart-env/multi/*.ajson
     */
    private async queryAjsonFallback(path: string, limit: number): Promise<Suggestion[]> {
        const envPath = '.smart-env/multi';
        if (!(await this.app.vault.adapter.exists(envPath))) return [];

        try {
            const files = await this.app.vault.adapter.list(envPath);
            const ajsonFiles = files.files.filter((f) => f.endsWith('.ajson'));
            const suggestions: Suggestion[] = [];

            for (const f of ajsonFiles) {
                const content = await this.app.vault.adapter.read(f);
                // Smart Connections .ajson is typically line-delimited JSON or large JSON blocks
                // We'll search for the current path in the embeddings map if possible
                if (content.includes(path)) {
                    // Primitive heuristic: if file mentions path, it's a weak relative
                    suggestions.push({
                        id: `sc_ajson:${f}:${path}`,
                        type: 'semantic' as const,
                        link: `[[${f.replace('.ajson', '')}]]`,
                        source: 'Semantic match found via .ajson index fallback.',
                        timestamp: Date.now(),
                        category: 'info' as const,
                        meta: {
                            description: 'Recovered from local Smart Connections index files.',
                        },
                    });
                }
                if (suggestions.length >= limit) break;
            }
            return suggestions;
        } catch (e) {
            HealerLogger.error('AJSON Fallback failed', e);
            return [];
        }
    }
}
