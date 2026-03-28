import { App, TFile } from 'obsidian';
import { SemanticGraphHealerSettings, Suggestion, DataviewPage } from '../types';
import {
    HealerLogger,
    extractLinkpaths,
    extractResolvedPaths,
    pathToWikilink,
    normalizeToLinkpath,
} from './HealerUtils';
import { VaultQueryEngine, SmartConnectionsAdapter } from './DataAdapter';

interface LinkSuggestion {
    alias?: string;
    file?: TFile;
}

export class QualityAnalyzer {
    private scAdapter: SmartConnectionsAdapter;

    constructor(
        private app: App,
        private settings: SemanticGraphHealerSettings,
        private engine: VaultQueryEngine,
    ) {
        this.scAdapter = new SmartConnectionsAdapter(app);
    }

    public async runQualityAnalysis(): Promise<Suggestion[]> {
        await Promise.resolve();
        HealerLogger.info('Starting graph quality audit (Precision Path mode)...');

        const query =
            this.settings.scanFolder && this.settings.scanFolder !== '/' ? `"${this.settings.scanFolder}"` : '';

        const pages = this.engine.getPages(query);
        const hierarchy = this.settings.hierarchies[0] || {
            up: [],
            down: [],
            next: [],
            prev: [],
            same: [],
        };

        let exclusionRegex: RegExp | null = null;
        if (this.settings.regexExclusionFilter) {
            try {
                exclusionRegex = new RegExp(this.settings.regexExclusionFilter);
            } catch (e) {
                HealerLogger.warn(`Invalid exclusion regex "${this.settings.regexExclusionFilter}", ignoring:`, e);
            }
        }

        const suggestions: Suggestion[] = [];
        const resolveCache = new Map<string, string | null>();

        // Pre-index Aliases for O(1) lookup during dangling check
        const aliasIndex = new Map<string, TFile>();
        const metadataCache = this.app.metadataCache as unknown as { getLinkSuggestions?: () => LinkSuggestion[] };
        const ls = metadataCache.getLinkSuggestions?.() ?? [];
        for (const s of ls) {
            if (s?.alias && s.file) {
                const aliasKey = normalizeToLinkpath(s.alias);
                const existing = aliasIndex.get(aliasKey);
                if (existing && existing.path !== s.file.path) {
                    HealerLogger.warn(
                        `Alias collision for "${aliasKey}": maps to both ${existing.path} and ${s.file.path}. Disabling direct alias resolution for this key.`,
                    );
                    aliasIndex.delete(aliasKey); // Avoid ambiguous resolution
                } else {
                    aliasIndex.set(aliasKey, s.file);
                }
            }
        }

        pages.forEach((page: DataviewPage) => {
            const file = page.file;
            if (exclusionRegex?.test(file.path)) return;

            const wikilinkFile = pathToWikilink(this.app, file.path, file.path);

            // 1. Orphan Check (uses RESOLVED paths for actual connectivity)
            const allKeys = [
                ...hierarchy.up,
                ...hierarchy.down,
                ...hierarchy.next,
                ...hierarchy.prev,
                ...hierarchy.same,
            ];
            const resolved = extractResolvedPaths(this.app, page, allKeys, file.path, resolveCache);

            if (resolved.length === 0 && !this.settings.ignoreOrphanNotes) {
                suggestions.push({
                    id: `orphan:${file.path}`, // Deterministic ID
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

            // 2. MOC Saturation (uses RESOLVED paths to avoid duplicate counting of same file)
            const resolvedDown = extractResolvedPaths(this.app, page, hierarchy.down, file.path, resolveCache);
            if (resolvedDown.length > this.settings.mocSaturationThreshold) {
                suggestions.push({
                    id: `moc_sat:${file.path}:${this.settings.mocSaturationThreshold}`, // Deterministic ID
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

            // 3. Dangling Links (Alias-Aware)
            const hierarchyKeys = [
                ...hierarchy.up,
                ...hierarchy.down,
                ...hierarchy.next,
                ...hierarchy.prev,
                ...hierarchy.same,
            ];

            hierarchyKeys.forEach((k) => {
                const val = page[k];
                if (!val) return;
                const extractedTargets = extractLinkpaths(page, [k]);
                extractedTargets.forEach((target) => {
                    const key = normalizeToLinkpath(target);
                    if (!key) return;

                    // 3.1 Primary Check: Direct linkpath resolution
                    let resolvedFile = this.app.metadataCache.getFirstLinkpathDest(key, file.path);

                    // 3.2 Secondary Check: Alias resolution (O(1) lookup)
                    if (!resolvedFile) {
                        resolvedFile = aliasIndex.get(key) || null;
                    }

                    if (!resolvedFile) {
                        suggestions.push({
                            id: `dangling:${file.path}:${k}:${target}`, // Deterministic ID
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
}
