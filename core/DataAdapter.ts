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

    /**
     * FIX: Correctly distinguishes between tag queries and folder/source queries.
     * - Tag query: starts with '#' → Datacore uses `@page and #tag`
     * - Folder query: wrapped in quotes → Datacore uses `@page and path("folder")`
     * - Empty query: returns all pages
     */
    async getPagesWithTag(query: string): Promise<DataviewPage[]> {
        const dc = this.getDatacoreApi();
        if (dc) {
            let dcQuery: string;

            if (!query) {
                // Empty: return all pages
                dcQuery = '@page';
            } else if (query.startsWith('#')) {
                // Tag query: pass directly
                const safeTag = query.replace(/"/g, '\\"');
                dcQuery = `@page and ${safeTag}`;
            } else if (query.startsWith('"') && query.endsWith('"')) {
                // Folder/source query: extract folder name and use path()
                const folderName = query.slice(1, -1).replace(/"/g, '\\"');
                dcQuery = `@page and path("${folderName}")`;
            } else {
                // Fallback: treat as generic filter
                dcQuery = `@page and ${query}`;
            }

            try {
                const results = dc.query<MarkdownPage>(dcQuery);
                HealerLogger.info(`Datacore query "${dcQuery}" returned ${results.length} pages.`);
                return results.map((p) => this.mapMarkdownToDataview(p));
            } catch (e) {
                HealerLogger.warn(`Datacore query failed: "${dcQuery}". Falling back to Dataview.`, e);
                // Fall through to Dataview
            }
        }

        const dv = this.getDataviewApi();
        if (dv) {
            const results = dv.pages(query);
            HealerLogger.info(`Dataview query "${query}" returned ${results.length} pages.`);
            return results;
        }

        HealerLogger.warn('No query engine available. Returning empty page set.');
        return [];
    }

    async getBacklinks(path: string): Promise<string[]> {
        const dc = this.getDatacoreApi();
        if (dc) {
            try {
                // Extract basename for wikilink syntax
                const basename = path.split('/').pop()?.replace(/\.md$/, '') || '';
                // FIX: linkedto() requires [[wikilink]] syntax, not quoted string paths
                const results = dc.query<MarkdownPage>(`@page and linkedto([[${basename}]])`);
                return results.map((p) => p.$path.split('/').pop()?.replace(/\.md$/, '') || '');
            } catch (e) {
                HealerLogger.warn('Datacore backlink query failed, falling back to cache.', e);
            }
        }

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
     *
     * FIX: $frontmatter is now spread FIRST (as base), then Datacore's processed
     * root-level fields overwrite them. This ensures that processed Link objects
     * from Datacore take priority over raw YAML strings from $frontmatter.
     * Also fixes file.name to exclude .md extension.
     */
    private mapMarkdownToDataview(page: MarkdownPage): DataviewPage {
        const filename = page.$path.split('/').pop() || '';
        const basename = filename.replace(/\.md$/, '');

        // Extract raw frontmatter as a safe base layer
        const rawFrontmatter = page.$frontmatter || {};

        // Build user fields from page root (excluding $ system keys)
        const userFields: Record<string, unknown> = {};
        for (const key of Object.keys(page)) {
            if (!key.startsWith('$')) {
                userFields[key] = page[key];
            }
        }

        return {
            // Layer 1: Raw frontmatter (lowest priority — raw YAML strings)
            ...rawFrontmatter,
            // Layer 2: Datacore processed fields (higher priority — Link objects, parsed arrays)
            ...userFields,
            // Layer 3: Synthetic 'file' object (highest priority — structural)
            file: {
                path: page.$path,
                name: basename, // FIX: exclude .md extension
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
                frontmatter: rawFrontmatter,
            },
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
