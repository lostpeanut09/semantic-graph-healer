import { App, TFile } from 'obsidian';
import { SemanticGraphHealerSettings, Suggestion, DataviewPage } from '../types';
import { HealerLogger, extractLinkpaths, generateId, resolveLinkpathsToPaths, pathToWikilink } from './HealerUtils';

import { VaultQueryEngine } from './DataAdapter';

export class TopologyAnalyzer {
    constructor(
        private app: App,
        private settings: SemanticGraphHealerSettings,
        private engine: VaultQueryEngine,
    ) {}

    private getScanQuery(): string {
        return this.settings.scanFolder && this.settings.scanFolder !== '/' ? `"${this.settings.scanFolder}"` : '';
    }

    public runDeterministicAnalysis(): Suggestion[] {
        HealerLogger.info('Starting deterministic graph scrutiny (Precision Path mode)...');

        const query = this.getScanQuery();
        const pages = this.engine.getPages(query);
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

        // 1. PRE-COMPUTE RELATIONSHIP MAPS (O(N) construction, O(1) access)
        const relMaps: Record<string, Map<string, Set<string>>> = {
            up: new Map(),
            down: new Map(),
            next: new Map(),
            prev: new Map(),
            same: new Map(),
        };

        const resolverCache = new Map<string, string | null>();

        pages.forEach((page) => {
            (['up', 'down', 'next', 'prev', 'same'] as const).forEach((relType) => {
                const keys = (hierarchy as unknown as Record<string, string[]>)[relType] || [];
                const linkpaths = extractLinkpaths(page, keys);
                const resolvedPaths = resolveLinkpathsToPaths(this.app, linkpaths, page.file.path, resolverCache);

                if (!relMaps[relType].has(page.file.path)) {
                    relMaps[relType].set(page.file.path, new Set());
                }
                resolvedPaths.forEach((p) => relMaps[relType].get(page.file.path)!.add(p));
            });
        });

        const suggestions: Suggestion[] = [];

        // 2. RECIPROCITY CHECK (Path-based, robust against aliases/omonyms)
        pages.forEach((pageA) => {
            const pathA = pageA.file.path;

            (['up', 'down', 'next', 'prev'] as const).forEach((relType) => {
                const invRelType = inverseMap[relType];
                const targetPaths = relMaps[relType].get(pathA) || new Set();

                targetPaths.forEach((pathB) => {
                    const targetsOfB = relMaps[invRelType].get(pathB) || new Set();

                    if (!targetsOfB.has(pathA)) {
                        const fileB = this.app.vault.getAbstractFileByPath(pathB);
                        const nameB = fileB instanceof TFile ? fileB.basename : pathB;

                        let linkB = `[[${pathB}]]`;
                        if (fileB instanceof TFile) {
                            // Perfect UI disambiguation using native API
                            const linktext = this.app.metadataCache.fileToLinktext(fileB, pathA, true);
                            linkB = `[[${linktext}]]`;
                        }

                        suggestions.push({
                            id: `asymmetry:${pathA}:${relType}:${pathB}`,
                            type: 'deterministic',
                            link: linkB,
                            source: `Topology asymmetry: ${pathToWikilink(this.app, pathA, pathA)} declares relationship '${relType}' to ${pathToWikilink(this.app, pathB, pathA)}, but ${pathToWikilink(this.app, pathB, pathB)} is missing reciprocal '${invRelType}' link.`,
                            timestamp: Date.now(),
                            category: 'suggestion',
                            meta: {
                                property: invRelType,
                                propertyKey: hierarchy[invRelType as keyof typeof hierarchy][0] || invRelType,
                                sourcePath: pathA,
                                targetPath: pathB,
                                sourceNote: pageA.file.basename,
                                targetNote: nameB,
                                description: `Missing ${invRelType} link in ${nameB}`,
                            },
                        });
                    }
                });
            });
        });

        return suggestions;
    }

    public runIncongruenceAnalysis(): Suggestion[] {
        HealerLogger.info('Starting incongruence analysis (Precision Path mode)...');

        const query = this.getScanQuery();
        const pages = this.engine.getPages(query);
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

        // 1. REGEXP GUARDRAIL (Avoid crash on invalid user patterns)
        const compiledRules: Array<{ regex: RegExp; property: string; maxCount: number }> = [];
        this.settings.customTopologyRules.forEach((r) => {
            try {
                compiledRules.push({
                    ...r,
                    regex: new RegExp(r.pattern),
                });
            } catch (e) {
                HealerLogger.error(`Invalid RegExp pattern in settings: "${r.pattern}"`, e);
            }
        });

        const suggestions: Suggestion[] = [];
        const resolverCache = new Map<string, string | null>();

        pages.forEach((page: DataviewPage) => {
            const file = page.file;

            for (const dir of directionalTypes) {
                if (dir.type === 'down' && !this.settings.strictDownCheck) continue;

                // Path-based extraction (resolves aliases to single targets)
                const linkpaths = extractLinkpaths(page, dir.keys);
                const uniquePaths = resolveLinkpathsToPaths(this.app, linkpaths, file.path, resolverCache);

                let maxThreshold = 1;
                if (dir.type === 'up' || dir.type === 'next' || dir.type === 'prev') {
                    maxThreshold = 1;
                }

                // Override with custom rules
                for (const key of dir.keys) {
                    const customRule = compiledRules.find((r) => r.regex.test(file.path) && r.property === key);
                    if (customRule) maxThreshold = Math.max(maxThreshold, customRule.maxCount);
                }

                if (uniquePaths.length > maxThreshold) {
                    HealerLogger.warn(
                        `Incongruence found in [[${file.path}]]: ${uniquePaths.length} unique targets for type '${dir.type}' (max ${maxThreshold})`,
                    );

                    // Map paths to smart wikilinks for UI
                    const competitorNames = uniquePaths.map((p) => {
                        const f = this.app.vault.getAbstractFileByPath(p);
                        return f instanceof TFile ? f.basename : p;
                    });

                    const competingSorted = uniquePaths.slice().sort();
                    const competitorLinks = competingSorted.map((p) => pathToWikilink(this.app, p, file.path));

                    suggestions.push({
                        id: `incongruence:${file.path}:${dir.type}:${competingSorted.join('|')}`,
                        type: 'incongruence',
                        link: pathToWikilink(this.app, file.path, file.path),
                        source: `Topology incongruence: ${pathToWikilink(this.app, file.path, file.path)} has multiple conflicting '${dir.type}' references: ${competitorLinks.join(', ')}.`,
                        timestamp: Date.now(),
                        category: 'error',
                        meta: {
                            property: dir.type,
                            sourcePath: file.path,
                            losers: competitorNames,
                            competingValues: competitorNames,
                        },
                    });
                }
            }
        });

        return suggestions;
    }

    public deriveTagSuggestions(tags: string[], filePath: string): Suggestion[] {
        const suggestions: Suggestion[] = [];
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return [];

        const fileName = file.basename;

        for (const tag of tags) {
            const cleanTag = tag.replace(/^#/, '');
            const parts = cleanTag.split('/').filter((p: string) => p);

            if (parts.length > 1) {
                // --- 1. PARENT RELATIONSHIP (up) ---
                const parentCandidate = parts[parts.length - 2];

                // FIX: Verify if parentCandidate exists as a real file
                const parentFile = this.app.metadataCache.getFirstLinkpathDest(parentCandidate, filePath);
                const confidence = parentFile ? 'suggestion' : 'info';
                const linkLabel = parentFile
                    ? pathToWikilink(this.app, parentFile.path, filePath)
                    : `[[${parentCandidate}]]`;

                suggestions.push({
                    id: generateId('tag_sync_up'),
                    type: 'deterministic',
                    link: linkLabel,
                    source: `Tag hierarchy sync: #${cleanTag} implies '${parentCandidate}' is a parent of [[${fileName}]].`,
                    timestamp: Date.now(),
                    category: confidence,
                    meta: {
                        property: 'up',
                        propertyKey: this.settings.hierarchies[0]?.up[0] || 'up',
                        sourcePath: filePath,
                        targetPath: parentFile?.path,
                        sourceNote: fileName,
                        targetNote: parentCandidate,
                        description: `Parent derived from tag #${cleanTag}${parentFile ? '' : ' (Note not found)'}`,
                    },
                });

                // --- 2. ROOT ANCESTOR (if depth > 2) ---
                if (parts.length > 2) {
                    const rootCandidate = parts[0];
                    const rootFile = this.app.metadataCache.getFirstLinkpathDest(rootCandidate, filePath);
                    const rootLinkLabel = rootFile
                        ? pathToWikilink(this.app, rootFile.path, filePath)
                        : `[[${rootCandidate}]]`;

                    suggestions.push({
                        id: generateId('tag_sync_root'),
                        type: 'deterministic',
                        link: rootLinkLabel,
                        source: `Tag hierarchy sync: #${cleanTag} places [[${fileName}]] under root topic '${rootCandidate}'.`,
                        timestamp: Date.now(),
                        category: 'info',
                        meta: {
                            property: 'up',
                            propertyKey: this.settings.hierarchies[0]?.up[0] || 'up',
                            sourcePath: filePath,
                            targetPath: rootFile?.path,
                            sourceNote: fileName,
                            targetNote: rootCandidate,
                            description: `Root ancestor from tag #${cleanTag}`,
                        },
                    });
                }
            }
        }

        return suggestions;
    }

    public async runOrphanAnalysis(): Promise<Suggestion[]> {
        await Promise.resolve();
        HealerLogger.info('Running Orphan Note Analysis...');
        const query = this.getScanQuery();
        const pages = this.engine.getPages(query);
        const suggestions: Suggestion[] = [];
        const resolvedLinks = this.app.metadataCache.resolvedLinks;

        // Build a set of all mentioned paths (targets)
        const allTargets = new Set<string>();
        for (const targets of Object.values(resolvedLinks)) {
            for (const targetPath of Object.keys(targets)) {
                allTargets.add(targetPath);
            }
        }

        pages.forEach((page) => {
            if (this.settings.ignoreOrphanNotes) return;
            const path = page.file.path;
            if (allTargets.has(path)) return;

            // Check if it has outgoing links
            const outgoing = resolvedLinks[path];
            if (outgoing && Object.keys(outgoing).length > 0) return;

            suggestions.push({
                id: `orphan:${path}`,
                type: 'quality',
                link: pathToWikilink(this.app, path, path),
                source: `Orphan Note: ${pathToWikilink(this.app, path, path)} has no incoming or outgoing links detected.`,
                timestamp: Date.now(),
                category: 'suggestion',
                meta: {
                    sourcePath: path,
                    sourceNote: page.file.basename,
                    description: 'Isolated node in the graph.',
                },
            });
        });

        return suggestions;
    }

    public async runStructuralGapAnalysis(file: TFile): Promise<Suggestion[]> {
        HealerLogger.info(`Running structural gap analysis for: ${file.path}`);

        // Define a local interface to satisfy lint without explicit 'any' issues
        interface EngineWithSC {
            getSmartConnectionsAdapter?: () => { query: (p: string, l: number) => Promise<Suggestion[]> };
        }

        const engineWithSC = this.engine as unknown as EngineWithSC;
        const adapter =
            typeof engineWithSC.getSmartConnectionsAdapter === 'function'
                ? engineWithSC.getSmartConnectionsAdapter()
                : null;

        const scSuggestions =
            this.settings.enableSmartConnections && adapter
                ? await adapter.query(file.path, this.settings.smartConnectionsLimit)
                : [];
        return scSuggestions;
    }

    public async runMocSaturationAnalysis(): Promise<Suggestion[]> {
        await Promise.resolve();
        HealerLogger.info('Running MOC Saturation Analysis...');
        const query = this.getScanQuery();
        const pages = this.engine.getPages(query);
        const suggestions: Suggestion[] = [];
        const threshold = this.settings.mocSaturationThreshold || 20;

        pages.forEach((page) => {
            const path = page.file.path;
            const links = this.app.metadataCache.resolvedLinks[path] || {};
            const linkCount = Object.keys(links).length;

            if (linkCount > threshold) {
                // If it's not already tagged as MOC, suggest it
                const tags = page.file.tags || [];
                if (!tags.some((t: string) => t.toLowerCase().includes('moc'))) {
                    suggestions.push({
                        id: `moc_candidate:${path}`,
                        type: 'quality',
                        link: pathToWikilink(this.app, path, path),
                        source: `Potential MOC: ${pathToWikilink(this.app, path, path)} has high link density (${linkCount} links).`,
                        timestamp: Date.now(),
                        category: 'info',
                        meta: {
                            sourcePath: path,
                            sourceNote: page.file.basename,
                            description: 'Consider promoting this note to a Map of Content.',
                        },
                    });
                }
            }
        });

        return suggestions;
    }

    public deriveTagSiblings(): Suggestion[] {
        HealerLogger.info('Starting tag sibling detection (Precision Path mode)...');
        const suggestions: Suggestion[] = [];
        const hierarchy = this.settings.hierarchies?.[0];
        if (!hierarchy) return [];

        const query = this.getScanQuery();
        const pages = this.engine.getPages(query);

        // Build Map: parentPrefix → Set of TFile Paths
        const parentTagMap = new Map<string, Set<string>>();

        pages.forEach((page) => {
            const tags = page.file.etags || page.file.tags || [];
            const tagArray = Array.isArray(tags) ? tags : Array.from(tags as Iterable<string>);

            tagArray.forEach((tag: string) => {
                const cleanTag = String(tag).replace(/^#/, '');
                const parts = cleanTag.split('/').filter((p) => p);

                if (parts.length > 1) {
                    const parentPrefix = parts.slice(0, -1).join('/');
                    if (!parentTagMap.has(parentPrefix)) {
                        parentTagMap.set(parentPrefix, new Set());
                    }
                    parentTagMap.get(parentPrefix)!.add(page.file.path);
                }
            });
        });

        // Loop through parent tags and create optimized suggestions
        parentTagMap.forEach((siblingPaths, parentPrefix) => {
            if (siblingPaths.size < 2 || siblingPaths.size > 50) return;

            const paths = [...siblingPaths];

            for (let i = 0; i < paths.length; i++) {
                for (let j = i + 1; j < paths.length; j++) {
                    const pathA = paths[i];
                    const pathB = paths[j];

                    const stableId = `tag_sibling:${parentPrefix}:${[pathA, pathB].sort().join('|')}`;

                    const fileA = this.app.vault.getAbstractFileByPath(pathA);
                    const fileB = this.app.vault.getAbstractFileByPath(pathB);
                    if (!(fileA instanceof TFile) || !(fileB instanceof TFile)) continue;

                    suggestions.push({
                        id: stableId,
                        type: 'deterministic',
                        link: `${pathToWikilink(this.app, pathA, pathB)} ↔ ${pathToWikilink(this.app, pathB, pathA)}`,
                        source: `Tag siblings: both share parent tag #${parentPrefix}. Consider linking as 'same'.`,
                        timestamp: Date.now(),
                        category: 'suggestion',
                        meta: {
                            property: 'same',
                            propertyKey: hierarchy.same[0] || 'same',
                            sourcePath: pathA,
                            targetPath: pathB,
                            sourceNote: fileA.basename,
                            targetNote: fileB.basename,
                            description: `Sibling relationship via shared tag prefix #${parentPrefix}`,
                        },
                    });
                }
            }
        });

        return suggestions;
    }

    public async runBridgeScrutiny(): Promise<Suggestion[]> {
        await Promise.resolve();
        const query = this.getScanQuery();
        const pages = this.engine.getPages(query);
        const suggestions: Suggestion[] = [];
        const hierarchy = this.settings.hierarchies?.[0];
        if (!hierarchy) return [];

        // P1: Graph Size Guardrail (Bug 17)
        // If the workspace is too large, we skip full structural bridge scans to avoid O(N^2) lag.
        if (pages.length > 2500) {
            HealerLogger.warn(`Bridge Scrutiny skipped: vault too large (${pages.length} nodes).`);
            return [];
        }

        // 1. Build Adjacency Maps
        const nextMap = new Map<string, Set<string>>();
        const resolverCache = new Map<string, string | null>();

        pages.forEach((p: DataviewPage) => {
            const nextLinkpaths = extractLinkpaths(p as unknown as Record<string, unknown>, hierarchy.next);
            const resolvedNext = resolveLinkpathsToPaths(this.app, nextLinkpaths, p.file.path, resolverCache);
            nextMap.set(p.file.path, new Set(resolvedNext));
        });

        // 2. Identification Logic: GAPS (A -> B, B -> C, but A -X-> C)
        // This is the INVERSE of a triangle. We want to complete the chain.
        pages.forEach((pageA) => {
            const pathA = pageA.file.path;
            const targetsOfA = nextMap.get(pathA) || new Set<string>();

            targetsOfA.forEach((pathB) => {
                if (pathB === pathA) return;
                const targetsOfB = nextMap.get(pathB) || new Set<string>();

                targetsOfB.forEach((pathC) => {
                    if (pathC === pathA || pathC === pathB) return;

                    // If A points to B, and B points to C, but A does NOT point to C...
                    // AND C does not point back to A (to avoid cycles)...
                    // THEN we have a potential missing direct link or a logical gap.
                    if (!targetsOfA.has(pathC)) {
                        const fileB = this.app.vault.getAbstractFileByPath(pathB);
                        const fileC = this.app.vault.getAbstractFileByPath(pathC);
                        if (!(fileB instanceof TFile) || !(fileC instanceof TFile)) return;

                        // Check if C is a triangle (Bug 13): if A points to C directly,
                        // we DON'T suggest it here as a gap. The current logic already does this check (!targetsOfA.has(pathC)).

                        suggestions.push({
                            id: `bridge_gap:${pathA}:${pathB}:${pathC}`,
                            type: 'deterministic',
                            link: pathToWikilink(this.app, pathC, pathA),
                            source: `Structural Gap: Chain ${pathToWikilink(this.app, pathA, pathA)} → ${pathToWikilink(this.app, pathB, pathB)} → ${pathToWikilink(this.app, pathC, pathC)} is broken. Direct link ${pathToWikilink(this.app, pathA, pathA)} → ${pathToWikilink(this.app, pathC, pathC)} is missing (Transitive relation).`,
                            timestamp: Date.now(),
                            category: 'info',
                            meta: {
                                property: 'next',
                                sourcePath: pathA,
                                targetPath: pathC,
                                sourceNote: pageA.file.basename,
                                targetNote: fileC.basename,
                                description: `Inferred transitive link: ${pageA.file.basename} should probably link to ${fileC.basename} via ${fileB.basename}`,
                            },
                        });
                    }
                });
            });
        });

        return suggestions;
    }

    public runCycleAnalysis(): Suggestion[] {
        HealerLogger.info('Starting hierarchical cycle detection (Precision Path mode)...');
        const suggestions: Suggestion[] = [];
        const hierarchy = this.settings.hierarchies?.[0];
        if (!hierarchy) return [];

        const query = this.getScanQuery();
        const pages = this.engine.getPages(query);
        const graph = new Map<string, string[]>();

        const resolverCache = new Map<string, string | null>();

        pages.forEach((p) => {
            const linkpaths = extractLinkpaths(p, hierarchy.up || []);
            const resolved = resolveLinkpathsToPaths(this.app, linkpaths, p.file.path, resolverCache);
            if (resolved.length > 0) graph.set(p.file.path, resolved);
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

        for (const [nodePath] of graph) {
            if (!visited.has(nodePath)) {
                const cyclePath = detectCycle(nodePath, []);
                if (cyclePath) {
                    const stableKey = [...new Set(cyclePath)].sort().join('|');
                    const stableId = `cycle_ouroboros:${stableKey}`;

                    suggestions.push({
                        id: stableId,
                        type: 'quality',
                        link: pathToWikilink(this.app, cyclePath[0], cyclePath[0]),
                        source: `Ouroboros: Infinite loop in hierarchy. Path: ${cyclePath.map((p) => pathToWikilink(this.app, p, p)).join(' → ')}`,
                        timestamp: Date.now(),
                        category: 'error',
                        meta: {
                            description: 'Circular dependency detected.',
                            sourcePath: cyclePath[0],
                            losers: cyclePath,
                        },
                    });
                }
            }
        }
        return suggestions;
    }

    public async runDanglingLinkAnalysis(): Promise<Suggestion[]> {
        await Promise.resolve();
        HealerLogger.info('Running Dangling Link Analysis...');
        const query = this.getScanQuery();
        const pages = this.engine.getPages(query);
        const suggestions: Suggestion[] = [];

        for (const page of pages) {
            const path = page.file.path;
            const abstractFile = this.app.vault.getAbstractFileByPath(path);
            if (!(abstractFile instanceof TFile)) continue;

            const cache = this.app.metadataCache.getFileCache(abstractFile);
            if (!cache) continue;

            // Check for unresolved links within the file
            const metadataCache = this.app.metadataCache as unknown as {
                unresolvedLinks: Record<string, Record<string, number>>;
            };
            const unresolved = metadataCache.unresolvedLinks?.[path];
            if (unresolved) {
                for (const linkText in unresolved) {
                    const linkCount = unresolved[linkText];
                    if (linkCount > 0) {
                        suggestions.push({
                            id: `dangling:${path}:${linkText}`,
                            type: 'quality',
                            link: pathToWikilink(this.app, path, path),
                            source: `Dangling Link: [[${page.file.basename}]] contains an unresolved link to '${linkText}'.`,
                            timestamp: Date.now(),
                            category: 'error',
                            meta: {
                                description: `Link target '${linkText}' does not exist.`,
                                sourcePath: path,
                                targetNote: linkText,
                            },
                        });
                    }
                }
            }
        }
        return suggestions;
    }

    public runFlowStagnationAnalysis(): Suggestion[] {
        HealerLogger.info('Starting flow stagnation analysis (Precision Path mode)...');
        const suggestions: Suggestion[] = [];

        const resolvedLinks = this.app.metadataCache.resolvedLinks;
        const unresolvedLinks = this.app.metadataCache.unresolvedLinks;

        const inDegree = new Map<string, number>();
        const outDegree = new Map<string, number>();

        for (const [source, targets] of Object.entries(resolvedLinks)) {
            const targetPaths = Object.keys(targets);
            outDegree.set(source, (outDegree.get(source) || 0) + targetPaths.length);

            for (const target of targetPaths) {
                inDegree.set(target, (inDegree.get(target) || 0) + 1);
            }
        }

        for (const [source, targets] of Object.entries(unresolvedLinks)) {
            const targetNames = Object.keys(targets);
            outDegree.set(source, (outDegree.get(source) || 0) + targetNames.length);
        }

        const mdFiles = this.app.vault.getMarkdownFiles();
        const fileMap = new Map<string, TFile>();
        mdFiles.forEach((f) => fileMap.set(f.path, f));

        if (this.settings.includeNonMarkdownHubs) {
            this.app.vault.getFiles().forEach((f) => {
                const isCanvas = f.extension === 'canvas';
                if (isCanvas) fileMap.set(f.path, f);
            });
        }

        const MIN_BACKLINKS = 5;

        fileMap.forEach((file, path) => {
            const isCanvas = file.extension === 'canvas';
            const isExcalidraw = file.name.endsWith('.excalidraw.md') || file.extension === 'excalidraw';

            const outs = outDegree.get(path) || 0;

            if (outs === 0) {
                const ins = inDegree.get(path) || 0;
                if (ins >= MIN_BACKLINKS) {
                    const stableId = `sink_stagnation:${path}`;
                    const typeLabel = isCanvas ? 'Canvas' : isExcalidraw ? 'Excalidraw' : 'Note';

                    suggestions.push({
                        id: stableId,
                        type: 'quality',
                        link: pathToWikilink(this.app, path, path),
                        source: `Flow Stagnation: This ${typeLabel} attracts ${ins} links but leads nowhere (0 outgoing).`,
                        timestamp: Date.now(),
                        category: isCanvas ? 'info' : 'suggestion',
                        meta: {
                            description: 'High in-degree, zero out-degree.',
                            sourcePath: path,
                            sourceNote: file.basename,
                            confidence: isCanvas ? 60 : 95,
                        },
                    });
                }
            }
        });
        return suggestions;
    }
}
