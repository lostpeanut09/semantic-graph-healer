/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { App, TFile } from 'obsidian';
import { DataviewApi, DataviewPage, DatacoreApi, MarkdownPage, Suggestion } from '../types';
import { HealerLogger, isObsidianInternalApp, pathToWikilink, generateId } from './HealerUtils';

/**
 * Production-grade implementation of VaultQueryEngine.
 * Hybrid engine: Datacore (Primary) -> Dataview (Fallback).
 */
export interface VaultQueryEngine {
    getPage(path: string): DataviewPage | null;
    getPages(query: string): DataviewPage[];
    getBacklinks(path: string): string[];
}

export class VaultDataAdapter implements VaultQueryEngine {
    constructor(private app: App) {}

    // --- Type-safe API accessors ---
    public getDataviewApi(): DataviewApi | null {
        if (!isObsidianInternalApp(this.app)) return null;
        const plugins = (this.app as any).plugins as { getPlugin(id: string): any };
        const plugin = plugins.getPlugin('dataview');
        if (!plugin || typeof plugin !== 'object' || !('api' in plugin)) return null;
        return plugin.api as DataviewApi;
    }

    public getDatacoreApi(): DatacoreApi | null {
        if (!isObsidianInternalApp(this.app)) return null;
        const plugins = (this.app as any).plugins as { getPlugin(id: string): any };
        const plugin = plugins.getPlugin('datacore');
        if (!plugin || typeof plugin !== 'object' || !('api' in plugin)) return null;
        return plugin.api as DatacoreApi;
    }

    private backlinkIndex: Map<string, Set<string>> | null = null;

    private buildBacklinkIndex(): Map<string, Set<string>> {
        const idx = new Map<string, Set<string>>();
        const resolvedLinks = this.app.metadataCache.resolvedLinks;

        for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
            for (const targetPath of Object.keys(targets)) {
                if (!idx.has(targetPath)) idx.set(targetPath, new Set());
                idx.get(targetPath)!.add(sourcePath);
            }
        }
        return idx;
    }

    public invalidateBacklinkIndex() {
        this.backlinkIndex = null;
    }

    // --- VaultQueryEngine Implementation ---
    public getPage(path: string): DataviewPage | null {
        const dc = this.getDatacoreApi();
        if (dc) {
            const page = dc.page<MarkdownPage>(path);
            if (page) return this.mapMarkdownToDataview(page);
        }

        const dv = this.getDataviewApi();
        if (dv) return dv.page(path);

        return null;
    }

    public getPages(query: string): DataviewPage[] {
        const dc = this.getDatacoreApi();
        if (dc) {
            let dcQuery: string;
            if (!query) {
                dcQuery = '@page';
            } else if (query.startsWith('#')) {
                // ✅ Datacore tag query standard
                dcQuery = `@page and ${query}`;
            } else if (query.startsWith('"') && query.endsWith('"')) {
                const folderName = query.slice(1, -1).replace(/\/+$/, '').replace(/"/g, '\\"');
                dcQuery = `@page and path("${folderName}")`;
            } else {
                dcQuery = `@page and ${query}`;
            }

            const result = dc.tryQuery<MarkdownPage>(dcQuery);
            if (result.successful) {
                return result.value.map((p) => this.mapMarkdownToDataview(p));
            }
        }

        const dv = this.getDataviewApi();
        if (dv) {
            const results = dv.pages(query);
            const array = (results as any).array ? (results as any).array() : Array.isArray(results) ? results : [];
            return array as unknown as DataviewPage[];
        }

        return [];
    }

    getBacklinks(targetPath: string): string[] {
        if (!this.backlinkIndex) {
            this.backlinkIndex = this.buildBacklinkIndex();
        }
        return [...(this.backlinkIndex.get(targetPath) ?? new Set())];
    }

    private mapMarkdownToDataview(page: MarkdownPage): DataviewPage {
        const filename = page.$path.split('/').pop() || '';
        const basename = filename.replace(/\.md$/, '');
        const rawFrontmatter = ((page as any).$frontmatter as Record<string, any>) || {};

        const userFields: Record<string, unknown> = {};
        const p = page as any;
        for (const key of Object.keys(p)) {
            if (!key.startsWith('$')) {
                userFields[key] = p[key];
            }
        }

        return {
            ...rawFrontmatter,
            ...userFields,
            file: {
                path: page.$path,
                name: basename,
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

    private getPluginInstance(): any {
        if (!isObsidianInternalApp(this.app)) return null;
        return (this.app as any).plugins.getPlugin('smart-connections');
    }

    public isAvailable(): boolean {
        const p = this.getPluginInstance();
        return !!(p && (p.env || p.api));
    }

    public async query(sourcePath: string, limit: number = 10): Promise<Suggestion[]> {
        const sc = this.getPluginInstance();
        if (sc && sc.env && sc.env.smart_sources) {
            try {
                const results = await sc.env.smart_sources.find({ query: sourcePath, limit: limit + 1 });

                const resultsArray: any[] = results || [];
                return resultsArray
                    .filter((res: any) => {
                        const targetPath = (res.path || res.item?.path || '') as string;
                        return targetPath && targetPath !== sourcePath;
                    })
                    .slice(0, limit)
                    .map((res: any) => {
                        const targetPath = (res.path || res.item?.path || '') as string;
                        const scoreNum = res.score ?? 0;
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
                HealerLogger.warn('Smart Connections env API failed, falling back to index search.', e);
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
