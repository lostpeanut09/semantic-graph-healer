import { App } from 'obsidian';
import { SemanticGraphHealerSettings, Suggestion } from '../types';
import { HealerLogger, extractLinks, generateId } from './HealerUtils';
import { VaultQueryEngine, SmartConnectionsAdapter } from './DataAdapter';

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
        HealerLogger.info('Starting graph quality audit...');

        const query =
            this.settings.scanFolder && this.settings.scanFolder !== '/' ? `"${this.settings.scanFolder}"` : '';

        const pages = this.engine.getPagesWithTag(query);
        const hierarchy = this.settings.hierarchies[0] || {
            up: [],
            down: [],
            next: [],
            prev: [],
            same: [],
        };

        const exclusionRegex = this.settings.regexExclusionFilter
            ? new RegExp(this.settings.regexExclusionFilter)
            : null;

        const suggestions: Suggestion[] = [];

        pages.forEach((page) => {
            const file = page.file;
            if (exclusionRegex?.test(file.path)) return;

            // 1. Orphan Check
            const allKeys = [
                ...hierarchy.up,
                ...hierarchy.down,
                ...hierarchy.next,
                ...hierarchy.prev,
                ...hierarchy.same,
            ];
            const links = extractLinks(page, allKeys);

            if (links.length === 0 && !this.settings.ignoreOrphanNotes) {
                suggestions.push({
                    id: generateId('orphan'),
                    type: 'quality',
                    link: `[[${file.name}]]`,
                    source: `Graph quality: [[${file.name}]] is a topological orphan (zero hierarchical links).`,
                    timestamp: Date.now(),
                    category: 'info',
                    meta: {
                        targetNote: file.name,
                        description: 'Note lacks hierarchical links.',
                    },
                });
            }

            // 2. MOC Saturation
            const downLinks = extractLinks(page, hierarchy.down);
            if (downLinks.length > this.settings.mocSaturationThreshold) {
                suggestions.push({
                    id: generateId('moc_sat'),
                    type: 'quality',
                    link: `[[${file.name}]]`,
                    source: `MOC Saturation: [[${file.name}]] has ${downLinks.length} children. Threshold is ${this.settings.mocSaturationThreshold}. Consider splitting.`,
                    timestamp: Date.now(),
                    category: 'info',
                    meta: {
                        targetNote: file.name,
                        description: `Saturation alert: ${downLinks.length} children detected.`,
                    },
                });
            }

            // 3. Dangling Links
            const hierarchyKeys = [
                ...hierarchy.up,
                ...hierarchy.down,
                ...hierarchy.next,
                ...hierarchy.prev,
                ...hierarchy.same,
            ];

            hierarchyKeys.forEach((k) => {
                if (!page[k]) return;
                const extractedTargets = extractLinks(page, [k]);
                extractedTargets.forEach((target) => {
                    if (!this.app.metadataCache.getFirstLinkpathDest(target, file.path)) {
                        suggestions.push({
                            id: generateId('dangling'),
                            type: 'quality',
                            link: `[[${file.name}]]`,
                            source: `Graph quality: property '${k}' links to non-existent note '${target}'.`,
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
    public async querySmartConnections(fileName: string, limit: number): Promise<Suggestion[]> {
        HealerLogger.info(`Querying Smart Connections for ${fileName}...`);
        return this.scAdapter.query(fileName, limit);
    }
}
