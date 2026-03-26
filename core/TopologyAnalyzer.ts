import { App, TFile } from 'obsidian';
import { SemanticGraphHealerSettings, Suggestion, DataviewPage } from '../types';
import { HealerLogger, extractLinks, generateId } from './HealerUtils';
import { VaultQueryEngine } from './DataAdapter';

export class TopologyAnalyzer {
    constructor(
        private app: App,
        private settings: SemanticGraphHealerSettings,
        private engine: VaultQueryEngine,
    ) {}

    public async runDeterministicAnalysis(): Promise<Suggestion[]> {
        HealerLogger.info('Starting deterministic graph scrutiny...');

        const query =
            this.settings.scanFolder && this.settings.scanFolder !== '/' ? `"${this.settings.scanFolder}"` : '';

        const pages = await this.engine.getPagesWithTag(query);
        const inverseMap: Record<string, string> = {
            up: 'down',
            down: 'up',
            next: 'prev',
            prev: 'next',
        };
        const hierarchy = this.settings.hierarchies[0] || {
            up: [],
            down: [],
            next: [],
            prev: [],
            same: [],
        };

        const pageMap = new Map<string, DataviewPage>();
        const aliasMap = new Map<string, DataviewPage>();

        pages.forEach((page) => {
            pageMap.set(page.file.name, page);
            const aliases =
                (page.file as unknown as { aliases?: string[] }).aliases ||
                (page as unknown as { aliases?: string[] }).aliases;
            if (aliases && Array.isArray(aliases)) {
                aliases.forEach((alias: string) => aliasMap.set(alias, page));
            }
        });

        const suggestions: Suggestion[] = [];

        pages.forEach((pageA) => {
            const fileNameA = pageA.file.name;

            (['up', 'down', 'next', 'prev'] as const).forEach((relType) => {
                const sourceKeys = (hierarchy as unknown as Record<string, string[]>)[relType] || [];
                const targets = extractLinks(pageA, sourceKeys);
                const invRelType = inverseMap[relType];
                const inverseKeys = (hierarchy as unknown as Record<string, string[]>)[invRelType] || [];

                targets.forEach((targetName: string) => {
                    const pageB = pageMap.get(targetName) || aliasMap.get(targetName);
                    if (!pageB) return;

                    const backLinks = extractLinks(pageB, inverseKeys);
                    if (!backLinks.includes(fileNameA)) {
                        suggestions.push({
                            id: generateId('asymmetry'),
                            type: 'deterministic',
                            link: `[[${targetName}]]`,
                            source: `Topology asymmetry: [[${fileNameA}]] declares [[${targetName}]] as '${relType}', but [[${targetName}]] is missing reciprocal '${invRelType}' link.`,
                            timestamp: Date.now(),
                            category: 'suggestion',
                            meta: {
                                property: invRelType,
                                sourceNote: fileNameA,
                                targetNote: targetName,
                                description: `Missing ${invRelType} link in ${targetName}`,
                            },
                        });
                    }
                });
            });
        });

        return suggestions;
    }

    public async runIncongruenceAnalysis(): Promise<Suggestion[]> {
        HealerLogger.info('Starting incongruence analysis...');

        const query =
            this.settings.scanFolder && this.settings.scanFolder !== '/' ? `"${this.settings.scanFolder}"` : '';

        const pages = await this.engine.getPagesWithTag(query);
        const hierarchy = this.settings.hierarchies[0] || {
            up: [],
            down: [],
            next: [],
            prev: [],
            same: [],
        };

        const directionalTypes = [
            { type: 'up', keys: hierarchy.up },
            { type: 'down', keys: hierarchy.down },
            { type: 'next', keys: hierarchy.next },
            { type: 'prev', keys: hierarchy.prev },
        ];

        const compiledRules = this.settings.customTopologyRules.map((r) => ({
            ...r,
            regex: new RegExp(r.pattern),
        }));

        const suggestions: Suggestion[] = [];

        pages.forEach((page) => {
            const file = page.file;

            for (const dir of directionalTypes) {
                if (dir.type === 'down' && !this.settings.strictDownCheck) continue;

                const uniqueLinks = extractLinks(page, dir.keys);

                let maxThreshold = 1;
                for (const key of dir.keys) {
                    const customRule = compiledRules.find((r) => r.regex.test(file.path) && r.property === key);
                    if (customRule) maxThreshold = Math.max(maxThreshold, customRule.maxCount);
                }

                if (uniqueLinks.length > maxThreshold) {
                    suggestions.push({
                        id: generateId('incongruence'),
                        type: 'incongruence',
                        link: `[[${file.name}]]`,
                        source: `Incongruence: [[${file.name}]] has multiple values for '${dir.type}'. COMPETING: ${uniqueLinks.join(', ')}. Max ${maxThreshold} allowed.`,
                        timestamp: Date.now(),
                        category: 'error',
                        meta: {
                            property: dir.type,
                            targetNote: file.name,
                            losers: uniqueLinks,
                            competingValues: uniqueLinks, // ← structured data for ReasoningService
                        },
                    });
                }
            }
        });

        return suggestions;
    }

    public deriveTagSuggestions(tags: string[], filePath: string): Suggestion[] {
        const suggestions: Suggestion[] = [];
        const fileName = filePath.split('/').pop()?.replace(/\.md$/, '') || 'Unknown';

        for (const tag of tags) {
            const cleanTag = tag.replace(/^#/, '');
            const parts = cleanTag.split('/').filter((p: string) => p);

            if (parts.length > 1) {
                const parentCandidate = parts[parts.length - 2];
                suggestions.push({
                    id: generateId('tag_sync'),
                    type: 'deterministic',
                    link: `[[${parentCandidate}]]`,
                    source: `Tag hierarchy sync: detected nested tag #${cleanTag}. Proposing '${parentCandidate}' as a parent (up) for this note.`,
                    timestamp: Date.now(),
                    category: 'suggestion',
                    meta: {
                        property: 'up',
                        sourceNote: fileName,
                        targetNote: parentCandidate,
                        description: `Hierarchy derived from tag #${cleanTag}`,
                    },
                });
            }
        }

        return suggestions;
    }

    /**
     * BRIDGE SCRUTINY: Identifies structural gaps (A -> C) where a node B should be inserted.
     * Especially useful when a new note B is created that fits between A and C.
     */
    public async runBridgeScrutiny(): Promise<Suggestion[]> {
        HealerLogger.info('Starting structural bridge scrutiny...');
        const suggestions: Suggestion[] = [];

        // 1. Define sequential pairs to monitor
        const chainPairs = [
            { source: 'next', target: 'prev' },
            { source: 'prev', target: 'next' },
        ];

        const hierarchy = this.settings.hierarchies?.[0];
        if (!hierarchy) return [];

        // 2. Fetch relevant pages (all if no newFile, otherwise focused scan)
        const pages = await this.engine.getPagesWithTag('');
        const nameToPage = new Map<string, DataviewPage>();
        pages.forEach((p) => {
            nameToPage.set(p.file.name, p);
            nameToPage.set(p.file.basename, p);
        });
        // 3. Identification Logic with Reverse Index Optimization
        const linkIndex = new Map<string, Set<string>>(); // target -> Set of pageB names
        pages.forEach((p) => {
            const allTargets = extractLinks(p, [...hierarchy.next, ...hierarchy.prev]);
            allTargets.forEach((t) => {
                if (!linkIndex.has(t)) linkIndex.set(t, new Set());
                linkIndex.get(t)!.add(p.file.name);
            });
        });

        for (const pageA of pages) {
            for (const pair of chainPairs) {
                const sourceKeys = hierarchy[pair.source as keyof typeof hierarchy] || [];
                const linksToC = extractLinks(pageA, sourceKeys);

                for (const nameC of linksToC) {
                    const pageC = nameToPage.get(nameC);
                    if (!pageC) continue;

                    // find candidates B that link to both A and C
                    const candidatesA = linkIndex.get(pageA.file.name) || new Set();
                    const candidatesC = linkIndex.get(pageC.file.name) || new Set();

                    // Intersection: Potential bridges
                    const bridgeNames = [...candidatesA].filter((name) => candidatesC.has(name));

                    for (const nameB of bridgeNames) {
                        if (nameB === pageA.file.name || nameB === pageC.file.name) continue;
                        const pageB = nameToPage.get(nameB);
                        if (!pageB) continue;

                        const bPrevKeys = hierarchy[pair.target as keyof typeof hierarchy] || [];
                        const bNextKeys = hierarchy[pair.source as keyof typeof hierarchy] || [];

                        const bLinksToA = extractLinks(pageB, bPrevKeys);
                        const bLinksToC = extractLinks(pageB, bNextKeys);

                        if (bLinksToA.includes(pageA.file.name) && bLinksToC.includes(pageC.file.name)) {
                            const stableId = `bridge_gap:${pageA.file.name}:${pageB.file.name}:${pageC.file.name}:${pair.source}`;
                            suggestions.push({
                                id: stableId,
                                type: 'deterministic',
                                link: `[[${pageB.file.name}]]`,
                                source: `Structural Gap: [[${pageA.file.name}]] → [[${pageC.file.name}]] should be [[${pageA.file.name}]] → [[${pageB.file.name}]] → [[${pageC.file.name}]]`,
                                timestamp: Date.now(),
                                category: 'suggestion',
                                meta: {
                                    property: pair.source,
                                    sourceNote: pageA.file.name,
                                    targetNote: pageB.file.name,
                                    winner: pageC.file.name,
                                    description: `Insert bridge note ${pageB.file.name}`,
                                },
                            });
                        }
                    }
                }
            }
        }

        return suggestions;
    }

    /**
     * SCENARIO 1: L'OUROBOROS (Detection di Cicli Gerarchici)
     * Finds infinite logic loops: A -> B -> C -> A.
     */
    public async runCycleAnalysis(): Promise<Suggestion[]> {
        HealerLogger.info('Starting hierarchical cycle detection (Ouroboros)...');
        const suggestions: Suggestion[] = [];
        const hierarchy = this.settings.hierarchies?.[0];
        if (!hierarchy) return [];

        const pages = await this.engine.getPagesWithTag('');
        const graph = new Map<string, string[]>();

        pages.forEach((p) => {
            const parents = extractLinks(p, hierarchy.up || []);
            if (parents.length > 0) graph.set(p.file.name, parents);
        });

        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const detectCycle = (node: string, path: string[]): string[] | null => {
            visited.add(node);
            recursionStack.add(node);
            path.push(node);

            const parents = graph.get(node) || [];
            for (const parent of parents) {
                if (!visited.has(parent)) {
                    const cycle = detectCycle(parent, path);
                    if (cycle) return cycle;
                } else if (recursionStack.has(parent)) {
                    const cycleStartIndex = path.indexOf(parent);
                    return [...path.slice(cycleStartIndex), parent];
                }
            }

            recursionStack.delete(node);
            path.pop();
            return null;
        };

        for (const [node] of graph) {
            if (!visited.has(node)) {
                const cyclePath = detectCycle(node, []);
                if (cyclePath) {
                    const cycleStr = cyclePath.map((n) => `[[${n}]]`).join(' → ');
                    const stableId = `cycle_ouroboros:${cyclePath.sort().join('|')}`;
                    suggestions.push({
                        id: stableId,
                        type: 'quality',
                        link: `[[${cyclePath[0]}]]`,
                        source: `Ouroboros: Infinite loop in hierarchy. Path: ${cycleStr}`,
                        timestamp: Date.now(),
                        category: 'error',
                        meta: {
                            description: 'Circular dependency detected.',
                            losers: cyclePath,
                        },
                    });
                    break;
                }
            }
        }
        return suggestions;
    }

    /**
     * SCENARIO 2: IL BUCO NERO (Information Sinks)
     * Finds notes with high in-degree but zero out-degree.
     */
    public async runFlowStagnationAnalysis(): Promise<Suggestion[]> {
        HealerLogger.info('Starting optimized flow stagnation analysis (Black Holes)...');
        const suggestions: Suggestion[] = [];

        // 1. Build Global Degree Map (Instant O(N) access)
        const resolvedLinks = this.app.metadataCache.resolvedLinks;
        const inDegree = new Map<string, number>();
        const outDegree = new Map<string, number>();

        for (const [source, targets] of Object.entries(resolvedLinks)) {
            const targetPaths = Object.keys(targets);
            // Record Out-Degree
            outDegree.set(source, targetPaths.length);

            // Record In-Degree
            for (const target of targetPaths) {
                inDegree.set(target, (inDegree.get(target) || 0) + 1);
            }
        }

        // 2. Select optimized set of files
        const mdFiles = this.app.vault.getMarkdownFiles();
        let otherHubs: TFile[] = [];
        if (this.settings.includeNonMarkdownHubs) {
            otherHubs = this.app.vault
                .getFiles()
                .filter((f) => f.extension === 'canvas' || f.name.endsWith('.excalidraw.md'));
        }
        const files = [...mdFiles, ...otherHubs];
        const MIN_BACKLINKS = 5;

        for (const file of files) {
            // Filter: Always Markdown, or Canvas/Excalidraw if enabled
            const isMd = file.extension === 'md';
            const isCanvas = file.extension === 'canvas';
            const isExcalidraw = file.name.endsWith('.excalidraw.md') || file.extension === 'excalidraw';

            if (!isMd) {
                if (!this.settings.includeNonMarkdownHubs) continue;
                if (!isCanvas && !isExcalidraw) continue;
            }

            const outs = outDegree.get(file.path) || 0;

            // Check Logic: Zero Exits
            if (outs === 0) {
                const ins = inDegree.get(file.path) || 0;

                // Threshold Check
                if (ins >= MIN_BACKLINKS) {
                    const stableId = `sink_stagnation:${file.path}`;
                    const typeLabel = isCanvas ? 'Canvas' : isExcalidraw ? 'Excalidraw' : 'Note';

                    suggestions.push({
                        id: stableId,
                        type: 'quality',
                        link: `[[${file.path}|${file.basename}]]`,
                        source: `Flow Stagnation: This ${typeLabel} attracts ${ins} links but leads nowhere (0 outgoing).`,
                        timestamp: Date.now(),
                        category: 'info',
                        meta: {
                            description: 'High in-degree, zero out-degree.',
                            sourceNote: file.basename,
                            confidence: 95,
                        },
                    });
                }
            }
        }
        return suggestions;
    }
}
