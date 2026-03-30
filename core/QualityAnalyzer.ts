import { App, TFile } from 'obsidian';
import { SemanticGraphHealerSettings, Suggestion, DataviewPage } from '../types';
import {
    HealerLogger,
    extractLinkpaths,
    extractResolvedPaths,
    pathToWikilink,
    normalizeToLinkpath,
    safeCompileRegex,
} from './HealerUtils';
import { VaultQueryEngine, SmartConnectionsAdapter } from './DataAdapter';

interface LinkSuggestion {
    alias?: string;
    file?: TFile;
}

export class QualityAnalyzer {
    private scAdapter: SmartConnectionsAdapter;
    private aliasCache: Map<string, TFile> | null = null;
    private aliasCacheTimestamp: number = 0;

    constructor(
        private app: App,
        private settings: SemanticGraphHealerSettings,
        private engine: VaultQueryEngine,
    ) {
        this.scAdapter = new SmartConnectionsAdapter(app);
    }

    /**
     * ✅ NEW: onProgress callback for UI feedback
     */
    public async runQualityAnalysis(onProgress?: (current: number, total: number) => void): Promise<Suggestion[]> {
        await Promise.resolve();
        HealerLogger.info('Starting graph quality audit (Precision Path mode)...');

        const query =
            this.settings.scanFolder && this.settings.scanFolder !== '/' ? `"${this.settings.scanFolder}"` : '';

        const pages = this.engine.getPages(query);
        const total = pages.length;

        const hierarchy = this.settings.hierarchies[0] || {
            up: [],
            down: [],
            next: [],
            prev: [],
            same: [],
            related: [],
        };

        const exclusionRegex = safeCompileRegex(this.settings.regexExclusionFilter);
        const suggestions: Suggestion[] = [];
        const resolveCache = new Map<string, string | null>();

        // ✅ IMPROVEMENT: Cache alias index to avoid repeated computation (5 min TTL)
        const now = Date.now();
        const ttl = this.settings.aliasCacheTtl || 300000;
        let aliasIndex: Map<string, TFile>;

        if (this.aliasCache && now - this.aliasCacheTimestamp < ttl) {
            aliasIndex = this.aliasCache;
        } else {
            aliasIndex = new Map<string, TFile>();
            const metadataCache = this.app.metadataCache as unknown as { getLinkSuggestions?: () => LinkSuggestion[] };
            const ls = metadataCache.getLinkSuggestions?.() ?? [];

            for (const s of ls) {
                if (s?.alias && s.file) {
                    const aliasKey = normalizeToLinkpath(s.alias);
                    const existing = aliasIndex.get(aliasKey);
                    if (existing && existing.path !== s.file.path) {
                        HealerLogger.warn(
                            `Alias collision for "${aliasKey}": maps to both ${existing.path} and ${s.file.path}.`,
                        );
                        aliasIndex.delete(aliasKey);
                    } else {
                        aliasIndex.set(aliasKey, s.file);
                    }
                }
            }
            this.aliasCache = aliasIndex;
            this.aliasCacheTimestamp = now;
        }

        pages.forEach((page: DataviewPage, index: number) => {
            if (onProgress) onProgress(index + 1, total);

            const file = page.file;
            if (exclusionRegex?.test(file.path)) return;

            const wikilinkFile = pathToWikilink(this.app, file.path, file.path);

            // 1. Orphan Check (EXCLUDES 'related' - associative by design)
            const allKeys = [
                ...(hierarchy.up || []),
                ...(hierarchy.down || []),
                ...(hierarchy.next || []),
                ...(hierarchy.prev || []),
                ...(hierarchy.same || []),
                // related is excluded here - unidirectional by design
            ];
            const resolved = extractResolvedPaths(this.app, page, allKeys, file.path, resolveCache);

            if (resolved.length === 0 && !this.settings.ignoreOrphanNotes) {
                suggestions.push({
                    id: `orphan:${file.path}`,
                    type: 'quality',
                    link: wikilinkFile,
                    source: `Graph quality: ${wikilinkFile} is a hierarchical orphan (zero resolved hierarchical links).`,
                    timestamp: Date.now(),
                    category: 'info',
                    meta: {
                        targetNote: file.name,
                        description: 'Note lacks hierarchical links.',
                    },
                });
            }

            // 2. MOC Saturation
            const resolvedDown = extractResolvedPaths(this.app, page, hierarchy.down, file.path, resolveCache);
            if (resolvedDown.length > this.settings.mocSaturationThreshold) {
                suggestions.push({
                    id: `moc_sat:${file.path}:${this.settings.mocSaturationThreshold}`,
                    type: 'quality',
                    link: wikilinkFile,
                    source: `MOC Saturation: ${wikilinkFile} has ${resolvedDown.length} children. Threshold is ${this.settings.mocSaturationThreshold}. Consider splitting.`,
                    timestamp: Date.now(),
                    category: 'info',
                    meta: {
                        targetNote: file.name,
                        description: `Saturation alert: ${resolvedDown.length} children detected.`,
                    },
                });
            }

            // 3. Dangling Links (INCLUDES 'related')
            const hierarchyKeys = [
                ...hierarchy.up,
                ...hierarchy.down,
                ...hierarchy.next,
                ...hierarchy.prev,
                ...hierarchy.same,
                ...(hierarchy.related || []),
            ];

            hierarchyKeys.forEach((k) => {
                const val = page[k];
                if (!val) return;

                const extractedTargets = extractLinkpaths(page, [k]);
                extractedTargets.forEach((target) => {
                    const key = normalizeToLinkpath(target);
                    if (!key) return;

                    let resolvedFile = this.app.metadataCache.getFirstLinkpathDest(key, file.path);
                    if (!resolvedFile) {
                        resolvedFile = aliasIndex.get(key) || null;
                    }

                    if (!resolvedFile) {
                        suggestions.push({
                            id: `dangling:${file.path}:${k}:${target}`,
                            type: 'quality',
                            link: wikilinkFile,
                            source: `Graph quality: property '${k}' in ${wikilinkFile} links to non-existent note '${target}'.`,
                            timestamp: Date.now(),
                            category: 'error',
                            meta: {
                                property: k,
                                sourceNote: file.name,
                                targetNote: target,
                                description: 'Reference to non-existent note.',
                            },
                        });
                    }
                });
            });
        });

        return suggestions;
    }

    /**
     * Proxy to SmartConnectionsAdapter for backward compat.
     */
    public async querySmartConnections(sourcePath: string, limit: number): Promise<Suggestion[]> {
        HealerLogger.info(`Querying Smart Connections for ${sourcePath}...`);
        return this.scAdapter.query(sourcePath, limit);
    }

    /**
     * ✅ NEW: Explicit alias cache invalidation
     */
    public invalidateAliasCache(): void {
        this.aliasCache = null;
        this.aliasCacheTimestamp = 0;
        HealerLogger.debug('Alias cache invalidated.');
    }
}
