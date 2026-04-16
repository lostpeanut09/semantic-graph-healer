import { TFile } from 'obsidian';
import { SemanticGraphHealerSettings, Suggestion, DataviewPage, ExtendedApp } from '../types';
import {
    HealerLogger,
    extractLinkpaths,
    generateId,
    resolveLinkpathsToPaths,
    pathToWikilink,
    safeString,
    isObsidianInternalApp,
    sleep,
} from './HealerUtils';

import { IMetadataAdapter } from './adapters/IMetadataAdapter';
import { LlmService } from './LlmService';
import { GraphEngine } from './GraphEngine';
import { Platform } from 'obsidian';
import SemanticGraphHealer from '../main';

export class TopologyAnalyzer {
    private BATCH_SIZE: number;
    private YIELD_INTERVAL: number;

    constructor(
        private app: ExtendedApp,
        private settings: SemanticGraphHealerSettings,
        private engine: IMetadataAdapter,
        private llm: LlmService,
        private plugin: SemanticGraphHealer,
    ) {
        // Hybrid Batching SOTA 2026: Mobile vs Desktop Optimization
        this.BATCH_SIZE = Platform.isMobile ? 20 : 100;
        this.YIELD_INTERVAL = Platform.isMobile ? 120 : 0; // 120ms yield for mobile responsiveness
    }

    /**
     * Checks if the Breadcrumbs plugin is active.
     * When Breadcrumbs is active, it automatically infers reciprocal edges (e.g., nextâ†”prev,
     * upâ†”down) at runtime without requiring explicit YAML in both notes.
     * We suppress our reciprocity warnings in this case to avoid false positives.
     */
    private isBreadcrumbsActive(): boolean {
        if (isObsidianInternalApp(this.app)) {
            return this.app.plugins.enabledPlugins.has('breadcrumbs');
        }
        return false;
    }

    private getScanQuery(): string {
        return this.settings.scanFolder && this.settings.scanFolder !== '/' ? `"${this.settings.scanFolder}"` : '';
    }

    public async runDeterministicAnalysis(): Promise<Suggestion[]> {
        HealerLogger.info('Starting deterministic graph scrutiny (Precision Path mode)...');

        const query = this.getScanQuery();
        const pages = this.engine.getPages(query);
        const inverseMap: Record<string, string> = {
            up: 'down',
            down: 'up',
            next: 'prev',
            prev: 'next',
            same: 'same',
            related: 'related',
        };
        const hierarchy = this.settings.hierarchies[0] || {
            up: [],
            down: [],
            next: [],
            prev: [],
            same: [],
            related: [],
        };

        // 1. PRE-COMPUTE RELATIONSHIP MAPS (O(N) construction, O(1) access)
        const relMaps: Record<string, Map<string, Set<string>>> = {
            up: new Map(),
            down: new Map(),
            next: new Map(),
            prev: new Map(),
            same: new Map(),
            related: new Map(),
        };

        const resolverCache = new Map<string, string | null>();

        let count = 0;
        for (const page of pages) {
            (['up', 'down', 'next', 'prev', 'same', 'related'] as const).forEach((relType) => {
                const keys = (hierarchy as Record<string, string[]>)[relType] || [];
                const linkpaths = extractLinkpaths(page, keys);
                const resolvedPaths = resolveLinkpathsToPaths(this.app, linkpaths, page.file.path, resolverCache);

                if (!relMaps[relType].has(page.file.path)) {
                    relMaps[relType].set(page.file.path, new Set());
                }
                resolvedPaths.forEach((p) => relMaps[relType].get(page.file.path)!.add(p));
            });

            count++;
            if (count % this.BATCH_SIZE === 0 && this.YIELD_INTERVAL > 0) {
                await new Promise((resolve) => setTimeout(resolve, this.YIELD_INTERVAL));
            }
        }

        const suggestions: Suggestion[] = [];
        const reciprocalTypes = ['up', 'down', 'next', 'prev', 'same'] as const;
        const allTypes = [...reciprocalTypes, 'related'] as const;

        // Use 'reciprocalTypes' for asymmetric link detection
        // Use 'allTypes' for dangling link checks if we had it in this loop (we don't, it's separate)
        // But we specifically need to handle 'related' based on setting:
        const checkArray = this.settings.requireRelatedReciprocity ? allTypes : reciprocalTypes;

        // 2. RECIPROCITY CHECK & DIRECTIONAL CONFLICTS
        count = 0;
        for (const pageA of pages) {
            const pathA = pageA.file.path;

            checkArray.forEach((relType) => {
                const targetPaths = relMaps[relType].get(pathA) || new Set();

                // Handle 'related' as a special pseudo-bidirectional loop if activated
                const invRelType = relType === 'related' ? 'related' : inverseMap[relType];

                targetPaths.forEach((pathB) => {
                    // 2a. Check for Directional Contradictions (e.g. A next B, B next A)
                    if (relType === 'next' || relType === 'prev') {
                        const bTargetsSameType = relMaps[relType].get(pathB) || new Set();
                        if (bTargetsSameType.has(pathA)) {
                            // SOTA 2026: Ignore valid circular sequences (A -> B -> C -> A)
                            // Only A <-> B direct reciprocity is a conflict for directional types.
                            if (!suggestions.find((s) => s.id === `conflict:${pathB}:${relType}:${pathA}`)) {
                                suggestions.push({
                                    id: `conflict:${pathA}:${relType}:${pathB}`,
                                    type: 'topology_gap',
                                    link: pathToWikilink(this.app, pathB, pathB),
                                    source: `Directional conflict: ${pathToWikilink(this.app, pathA, pathA)} and ${pathToWikilink(this.app, pathB, pathB)} both declare '${relType}' toward each other.`,
                                    timestamp: Date.now(),
                                    category: 'error',
                                });
                            }
                        }
                    }

                    // 2b. Reciprocity check for non-directional types
                    if (relType !== 'next' && relType !== 'prev') {
                        const bTargetsBack = relMaps[invRelType].get(pathB) || new Set();
                        if (!bTargetsBack.has(pathA)) {
                            // Severity mapping based on strict check
                            const severity =
                                this.settings.strictDownCheck && relType === 'down' ? 'error' : 'suggestion';
                            const targetBasename = pathB.split('/').pop()?.replace('.md', '') || pathB;
                            suggestions.push({
                                id: `missing_reciprocity:${pathA}:${relType}:${pathB}`,
                                type: 'topology_gap',
                                link: pathToWikilink(this.app, pathB, pathB),
                                source: `${pathToWikilink(this.app, pathA, pathA)} defines ${pathToWikilink(this.app, pathB, pathB)} as '${relType}', but ${pathToWikilink(this.app, pathB, pathB)} does not have a back-reference.`,
                                timestamp: Date.now(),
                                category: severity,
                                // ✅ FIX BUG 1: Aggiunto meta object per l'Executor
                                meta: {
                                    property: invRelType,
                                    propertyKey: (hierarchy as Record<string, string[]>)[invRelType]?.[0] || invRelType,
                                    sourcePath: pathA, // Cosa scrivere (A)
                                    targetPath: pathB, // Dove scriverlo (B)
                                    sourceNote: pageA.file.basename,
                                    targetNote: targetBasename,
                                },
                            });
                        }
                    }

                    // 2c. Directional Reciprocity (next <-> prev)
                    // BREADCRUMBS GUARD: Breadcrumbs V4 infers these edges automatically at runtime,
                    // so explicit YAML is not required in both notes. Suppress false positives.
                    if ((relType === 'next' || relType === 'prev') && !this.isBreadcrumbsActive()) {
                        const targetInvType = relType === 'next' ? 'prev' : 'next';
                        const bTargetsBack = relMaps[targetInvType].get(pathB) || new Set();
                        if (!bTargetsBack.has(pathA)) {
                            const targetBasename = pathB.split('/').pop()?.replace('.md', '') || pathB;
                            suggestions.push({
                                id: `missing_directional_reciprocity:${pathA}:${relType}:${pathB}`,
                                type: 'topology_gap',
                                link: pathToWikilink(this.app, pathB, pathB),
                                source: `${pathToWikilink(this.app, pathA, pathA)} defines ${pathToWikilink(this.app, pathB, pathB)} as '${relType}', but ${pathToWikilink(this.app, pathB, pathB)} is missing the corresponding '${targetInvType}' back-link.`,
                                timestamp: Date.now(),
                                category: 'suggestion',
                                // ✅ FIX BUG 1: Aggiunto meta object per l'Executor
                                meta: {
                                    property: targetInvType,
                                    propertyKey:
                                        (hierarchy as Record<string, string[]>)[targetInvType]?.[0] || targetInvType,
                                    sourcePath: pathA, // Cosa scrivere (A)
                                    targetPath: pathB, // Dove scriverlo (B)
                                    sourceNote: pageA.file.basename,
                                    targetNote: targetBasename,
                                },
                            });
                        }
                    }
                });
            });

            count++;
            if (count % this.BATCH_SIZE === 0 && this.YIELD_INTERVAL > 0) {
                await new Promise((resolve) => setTimeout(resolve, this.YIELD_INTERVAL));
            }
        }

        // 3. PRO-ACTIVE INTELLIGENCE: DEEP TOPOLOGY (SOTA 2026)
        if (this.settings.enableDeepTopology) {
            HealerLogger.info('Engaging Deep Topology Discovery (Worker-offloaded)...');
            const graphEngine = new GraphEngine(this.plugin);
            graphEngine.buildGraph();

            const predictedLinks = await graphEngine.runSimilarityAnalysis();
            suggestions.push(...predictedLinks);
        }

        return suggestions;
    }

    public async runIncongruenceAnalysis(): Promise<Suggestion[]> {
        HealerLogger.info('Starting incongruence analysis (Precision Path mode)...');

        const query = this.getScanQuery();
        const pages = this.engine.getPages(query);
        const hierarchy = this.settings.hierarchies[0] || {
            up: [],
            down: [],
            next: [],
            prev: [],
            same: [],
            related: [],
        };

        const directionalTypes = [
            { type: 'up', keys: hierarchy.up },
            { type: 'down', keys: hierarchy.down },
            { type: 'next', keys: hierarchy.next },
            { type: 'prev', keys: hierarchy.prev },
            { type: 'same', keys: hierarchy.same },
            { type: 'related', keys: hierarchy.related || [] },
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

        let count = 0;
        for (const page of pages) {
            const file = page.file;

            for (const dir of directionalTypes) {
                if (dir.type === 'down' && !this.settings.strictDownCheck) continue;

                const linkpaths = extractLinkpaths(page, dir.keys);
                const uniquePaths = resolveLinkpathsToPaths(this.app, linkpaths, file.path, resolverCache);

                let maxThreshold = 1;
                if (dir.type === 'up') {
                    maxThreshold = this.settings.allowMultipleParents ? 999 : 1;
                } else if (dir.type === 'next' && !this.settings.allowNextBranching) {
                    maxThreshold = 1;
                } else if (dir.type === 'prev' && !this.settings.allowPrevBranching) {
                    maxThreshold = 1;
                } else if (dir.type === 'next' || dir.type === 'prev') {
                    maxThreshold = 999;
                } else if (dir.type === 'down' || dir.type === 'same' || dir.type === 'related') {
                    maxThreshold = 999;
                }

                // Override with custom rules
                for (const key of dir.keys) {
                    const customRule = compiledRules.find((r) => r.regex.test(file.path) && r.property === key);
                    if (customRule) maxThreshold = Math.max(maxThreshold, customRule.maxCount);
                }

                if (uniquePaths.length > maxThreshold) {
                    const isVerifiableBranching =
                        (dir.type === 'next' || dir.type === 'prev') && this.settings.requireAIBranchValidation;

                    const competingSorted = uniquePaths.slice().sort();
                    const competitorLinks = competingSorted.map((p) => pathToWikilink(this.app, p, file.path));

                    suggestions.push({
                        id: `incongruence:${file.path}:${dir.type}:${competingSorted.join('|')}`,
                        type: 'incongruence',
                        link: pathToWikilink(this.app, file.path, file.path),
                        source: `${isVerifiableBranching ? '[AI Verifiable] ' : ''}Topology incongruence: ${pathToWikilink(this.app, file.path, file.path)} has multiple conflicting '${dir.type}' references: ${competitorLinks.join(', ')}.`,
                        timestamp: Date.now(),
                        category: isVerifiableBranching ? 'suggestion' : 'error',
                    });
                }
            }

            count++;
            if (count % this.BATCH_SIZE === 0 && this.YIELD_INTERVAL > 0) {
                await new Promise((resolve) => setTimeout(resolve, this.YIELD_INTERVAL));
            }
        }

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
            getSmartConnectionsAdapter?: () => { query: (path: string, limit: number) => Promise<Suggestion[]> };
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

        // Build Map: parentPrefix â†’ Set of TFile Paths
        const parentTagMap = new Map<string, Set<string>>();

        pages.forEach((page: DataviewPage) => {
            const tags = page.file.etags || page.file.tags || [];
            const tagArray = Array.isArray(tags) ? tags : Array.from(tags as Iterable<string>);

            tagArray.forEach((tag: unknown) => {
                const cleanTag = String(tag).replace(/^#/, '');
                const parts = cleanTag.split('/').filter((p: string) => p);

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
            if (siblingPaths.size < 2 || siblingPaths.size > 500) return;

            const paths = [...siblingPaths];
            const tagDepth = parentPrefix.split('/').filter(Boolean).length;
            const priority = Math.min(paths.length * 2 + tagDepth * 5, 100);

            for (let i = 0; i < paths.length; i++) {
                for (let j = i + 1; j < paths.length; j++) {
                    const pathA = paths[i];
                    const pathB = paths[j];

                    const stableIdA = `tag_sibling:${parentPrefix}:${pathA}->${pathB}`;
                    const stableIdB = `tag_sibling:${parentPrefix}:${pathB}->${pathA}`;

                    const fileA = this.app.vault.getAbstractFileByPath(pathA);
                    const fileB = this.app.vault.getAbstractFileByPath(pathB);
                    if (!(fileA instanceof TFile) || !(fileB instanceof TFile)) continue;

                    // ✅ FIX BUG 2: Suggestion 1 (Scrive in A puntando a B)
                    suggestions.push({
                        id: stableIdA,
                        type: 'deterministic',
                        link: `${pathToWikilink(this.app, pathA, pathA)} (add ${fileB.basename})`,
                        source: `Tag siblings: both share parent tag #${parentPrefix}. Consider linking as 'same'.`,
                        timestamp: Date.now(),
                        category: 'suggestion',
                        meta: {
                            property: 'same',
                            propertyKey: hierarchy.same[0] || 'same',
                            sourcePath: pathB, // Cosa scrivere (B)
                            targetPath: pathA, // Dove scriverlo (A)
                            sourceNote: fileB.basename,
                            targetNote: fileA.basename,
                            confidence: priority,
                        },
                    });

                    // ✅ FIX BUG 2: Suggestion 2 (Scrive in B puntando ad A)
                    suggestions.push({
                        id: stableIdB,
                        type: 'deterministic',
                        link: `${pathToWikilink(this.app, pathB, pathB)} (add ${fileA.basename})`,
                        source: `Tag siblings: both share parent tag #${parentPrefix}. Consider linking as 'same'.`,
                        timestamp: Date.now(),
                        category: 'suggestion',
                        meta: {
                            property: 'same',
                            propertyKey: hierarchy.same[0] || 'same',
                            sourcePath: pathA, // Cosa scrivere (A)
                            targetPath: pathB, // Dove scriverlo (B)
                            sourceNote: fileA.basename,
                            targetNote: fileB.basename,
                            confidence: priority,
                        },
                    });
                }
            }
        });

        return suggestions;
    }

    public async runBridgeScrutiny(scopeFile?: TFile): Promise<Suggestion[]> {
        await Promise.resolve();
        const query = this.getScanQuery();
        let pages = this.engine.getPages(query);
        const suggestions: Suggestion[] = [];
        const hierarchy = this.settings.hierarchies?.[0];
        if (!hierarchy) return [];

        // P1: Dynamic Graph Size Guardrail
        // If the workspace is too large or Deep Graph is enabled, we adjust the limit to avoid O(N^2) UI freezing.
        // We SKIP this guard if we are scoped to a single file.
        const bridgeLimit = this.settings.enableDeepGraphAnalysis ? 1500 : 2500;
        if (!scopeFile && pages.length > bridgeLimit) {
            HealerLogger.warn(
                `Bridge Scrutiny skipped: vault too large (${pages.length} nodes, limit: ${bridgeLimit}).`,
            );
            return [];
        }

        // 1. Build Adjacency Maps
        const relMaps: Record<string, Map<string, Set<string>>> = {
            up: new Map(),
            down: new Map(),
            next: new Map(),
            prev: new Map(),
        };
        const resolverCache = new Map<string, string | null>();

        pages.forEach((p: DataviewPage) => {
            (['up', 'down', 'next', 'prev'] as const).forEach((rel) => {
                const linkpaths = extractLinkpaths(p, hierarchy[rel]);
                const resolved = resolveLinkpathsToPaths(this.app, linkpaths, p.file.path, resolverCache);
                relMaps[rel].set(p.file.path, new Set(resolved));
            });
        });

        // P1b Scoping: If we have a scope file, we only care about chains that involve it
        if (scopeFile) {
            const scopePath = scopeFile.path;
            const neighbors = new Set<string>([scopePath]);
            (['up', 'down', 'next', 'prev'] as const).forEach((rel) => {
                const related = relMaps[rel].get(scopePath);
                if (related) related.forEach((r) => neighbors.add(r));
                // Also reverse lookup: who points to scopePath?
                relMaps[rel].forEach((targets, source) => {
                    if (targets.has(scopePath)) neighbors.add(source);
                });
            });
            pages = pages.filter((p) => neighbors.has(p.file.path));
        }

        const maxDepth = this.settings.bridgeScrutinyMaxDepth ?? 1;
        if (maxDepth === 0) {
            HealerLogger.info('Bridge Scrutiny disabled (bridgeScrutinyMaxDepth = 0).');
            return [];
        }

        const directions = this.settings.enableVastBridgeScrutiny
            ? (['up', 'down', 'next', 'prev'] as const)
            : (['up'] as const);

        directions.forEach((dir: 'up' | 'down' | 'next' | 'prev') => {
            const map = relMaps[dir];

            pages.forEach((pageA) => {
                const pathA = pageA.file.path;
                const targetsOfA = map.get(pathA) || new Set<string>();

                targetsOfA.forEach((pathB) => {
                    if (pathB === pathA) return;
                    const targetsOfB = map.get(pathB) || new Set<string>();

                    targetsOfB.forEach((pathC) => {
                        if (pathC === pathA || pathC === pathB) return;

                        // DEPTH GUARD: For maxDepth=1, we stop here (Aâ†’Bâ†’C only).
                        // For maxDepth>1 we'd recurse further â€” but for now the loop
                        // structure inherently scans only one level deep, so this check
                        // is a semantic annotation and future-proofing flag.
                        if (!targetsOfA.has(pathC)) {
                            const fileC = this.app.vault.getAbstractFileByPath(pathC);
                            if (!(fileC instanceof TFile)) return;

                            suggestions.push({
                                id: `bridge_gap:${dir}:${pathA}:${pathB}:${pathC}`,
                                type: 'deterministic',
                                link: pathToWikilink(this.app, pathC, pathA),
                                source: `Structural Gap (${dir}): Hierarchy ${pathToWikilink(this.app, pathA, pathA)} â†’ ${pathToWikilink(this.app, pathB, pathB)} â†’ ${pathToWikilink(this.app, pathC, pathC)} is missing a direct link. Consider completing the bridge.`,
                                timestamp: Date.now(),
                                category: 'info',
                                meta: {
                                    property: dir,
                                    sourcePath: pathA,
                                    targetPath: pathC,
                                    sourceNote: pageA.file.basename,
                                    targetNote: fileC.basename,
                                    description: `Inferred transitive link (${dir}, depth=${maxDepth})`,
                                    confidence: 85,
                                },
                            });
                        }
                    });
                });
            });
        });

        return suggestions;
    }

    public async runCycleAnalysis(): Promise<Suggestion[]> {
        await Promise.resolve();
        HealerLogger.info('Starting hierarchical cycle detection (Precision Path mode)...');
        const suggestions: Suggestion[] = [];
        const hierarchy = this.settings.hierarchies?.[0];
        if (!hierarchy) return [];

        const query = this.getScanQuery();
        const pages = this.engine.getPages(query);

        const performCycleCheck = (propertyKeys: string[], edgeType: string) => {
            const graph = new Map<string, string[]>();
            const resolverCache = new Map<string, string | null>();

            pages.forEach((p: DataviewPage) => {
                const linkpaths = extractLinkpaths(p, propertyKeys);
                const resolved = resolveLinkpathsToPaths(this.app, linkpaths, p.file.path, resolverCache);
                if (resolved.length > 0) graph.set(p.file.path, resolved);
            });

            const visited = new Set<string>();
            const recursionStack = new Set<string>();

            const detectCycle = (node: string, path: string[]): string[] | null => {
                visited.add(node);
                recursionStack.add(node);
                path.push(node);

                const targets = graph.get(node) || [];
                for (const target of targets) {
                    if (!visited.has(target)) {
                        const cycle = detectCycle(target, path);
                        if (cycle) return cycle;
                    } else if (recursionStack.has(target)) {
                        const cycleStartIndex = path.indexOf(target);
                        return [...path.slice(cycleStartIndex), target];
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
                        const stableId = `cycle_ouroboros:${edgeType}:${stableKey}`;

                        let severity: 'error' | 'suggestion' | 'info' = 'error';
                        if (edgeType !== 'sequence') {
                            if (cyclePath.length <= 3) severity = 'error';
                            else if (cyclePath.length <= 5) severity = 'suggestion';
                            else severity = 'info';
                        }

                        suggestions.push({
                            id: stableId,
                            type: 'quality',
                            link: pathToWikilink(this.app, cyclePath[0], cyclePath[0]),
                            source: `Ouroboros (${edgeType}): Infinite loop detected. Path: ${cyclePath.map((p) => pathToWikilink(this.app, p, p)).join(' â†’ ')}`,
                            timestamp: Date.now(),
                            category: severity,
                            meta: {
                                description: `Circular dependency in '${edgeType}' flow.`,
                                sourcePath: cyclePath[0],
                                losers: cyclePath,
                            },
                        });
                    }
                }
            }
        };

        // ✅ FIX BUG 4: Controllo cicli anche su percorsi inversi
        performCycleCheck(hierarchy.up || [], 'hierarchy');
        performCycleCheck(hierarchy.down || [], 'hierarchy_down');
        performCycleCheck(hierarchy.next || [], 'sequence');
        performCycleCheck(hierarchy.prev || [], 'sequence_prev');
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
            const unresolved = this.app.metadataCache.unresolvedLinks?.[path];
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

    public async runFlowStagnationAnalysis(): Promise<Suggestion[]> {
        await Promise.resolve();
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

    public async getContextForAIValidation(
        sourcePath: string,
        targetPaths: string[],
    ): Promise<{
        sourceContent: string;
        targetContents: string[];
        existingRelations: string;
    }> {
        const MAX_CONTENT_LENGTH = 5000;
        const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
        const sourceContent =
            sourceFile instanceof TFile
                ? await this.app.vault
                      .read(sourceFile)
                      .then((c) => {
                          if (c.length > MAX_CONTENT_LENGTH)
                              HealerLogger.warn(
                                  `File ${sourceFile.path} truncated to ${MAX_CONTENT_LENGTH} chars for AI context`,
                              );
                          return c.substring(0, MAX_CONTENT_LENGTH);
                      })
                      .catch(() => '')
                : '';

        const targetContents: string[] = [];
        for (const targetPath of targetPaths) {
            if (!targetPath) {
                targetContents.push('');
                continue;
            }
            const targetFile = this.app.vault.getAbstractFileByPath(targetPath);
            const content =
                targetFile instanceof TFile
                    ? await this.app.vault
                          .read(targetFile)
                          .then((c) => {
                              if (c.length > MAX_CONTENT_LENGTH)
                                  HealerLogger.warn(
                                      `Target ${targetFile.path} truncated to ${MAX_CONTENT_LENGTH} chars for AI context`,
                                  );
                              return c.substring(0, MAX_CONTENT_LENGTH);
                          })
                          .catch(() => '')
                    : '';
            targetContents.push(content);
        }

        // Gather existing relations for the source
        const sourcePage = this.engine.getPage(sourcePath);
        const existingRelations = sourcePage
            ? `up: ${safeString(sourcePage.up)}, down: ${safeString(sourcePage.down)}, next: ${safeString(sourcePage.next)}, prev: ${safeString(sourcePage.prev)}`
            : 'No existing relations';

        return { sourceContent, targetContents, existingRelations };
    }

    /**
     * âœ… NEW: Phase 3 - Detect Semantically Incorrect Children (Deep AI Audit)
     * Runs AI validation on down relationships.
     */
    public async runSemanticChildValidation(signal?: AbortSignal): Promise<Suggestion[]> {
        if (!this.settings.enableSemanticAudit) {
            HealerLogger.debug('Semantic child validation disabled in settings.');
            return [];
        }

        HealerLogger.info('Starting semantic child validation (AI-powered deep audit)...');
        const suggestions: Suggestion[] = [];

        const query = this.getScanQuery();
        const pages = this.engine.getPages(query);

        // Guardrail for large vaults
        if (pages.length > 3000) {
            HealerLogger.warn(`Semantic child validation skipped: vault too large (${pages.length} nodes).`);
            return [];
        }

        const hierarchy = this.settings.hierarchies[0] || { down: [] };
        const downKeys = hierarchy.down.length > 0 ? hierarchy.down : ['down', 'child'];

        // Build parent-child map
        const parentChildMap = new Map<string, Array<{ childPath: string; childName: string; mtime: number }>>();
        const resolverCache = new Map<string, string | null>();

        let count = 0;
        for (const page of pages) {
            if (signal?.aborted) return [];

            // UI YIELDING: Release thread every 50 files
            if (++count % 50 === 0) await sleep(0);

            const linkpaths = extractLinkpaths(page, downKeys);
            const childPaths = resolveLinkpathsToPaths(this.app, linkpaths, page.file.path, resolverCache);

            for (const childPath of childPaths) {
                if (!parentChildMap.has(page.file.path)) {
                    parentChildMap.set(page.file.path, []);
                }
                const childFile = this.app.vault.getAbstractFileByPath(childPath);
                if (childFile instanceof TFile) {
                    parentChildMap.get(page.file.path)!.push({
                        childPath,
                        childName: childFile.basename,
                        mtime: childFile.stat.mtime,
                    });
                }
            }
        }

        // Validate relationships with AI (BATCHED)
        for (const [parentPath, children] of parentChildMap.entries()) {
            if (signal?.aborted) return suggestions;

            const parentFile = this.app.vault.getAbstractFileByPath(parentPath);
            if (!(parentFile instanceof TFile)) continue;

            const parentContent = await this.app.vault.read(parentFile).catch(() => '');

            // UI YIELDING: Release thread before heavy AI call
            await sleep(0);

            // BATCH VALIDATION: Grouped by parent
            const batchResults = await this.llm.validateRelationshipsBatch(
                parentFile.basename,
                children.map((c) => ({ name: c.childName, content: '', mtime: c.mtime })), // Content fetched inside LLM or passed if small
                parentContent,
                parentFile.stat.mtime,
                signal,
            );

            for (const child of children) {
                const validation = batchResults[child.childName] || { valid: true, reason: 'Skipped' };

                if (!validation.valid) {
                    suggestions.push({
                        id: `semantic_child:${parentPath}:${child.childPath}`, // Deterministic ID for duplicate prevention
                        type: 'semantic',
                        category: 'error',
                        link: `${pathToWikilink(this.app, parentPath, parentPath)} â†’ ${pathToWikilink(this.app, child.childPath, parentPath)}`,
                        source: `Semantic Mismatch: "${child.childName}" may not be an appropriate child of "${parentFile.basename}". AI Reason: ${validation.reason}`,
                        timestamp: Date.now(),
                        meta: {
                            property: 'down',
                            sourcePath: parentPath,
                            targetPath: child.childPath,
                            sourceNote: parentFile.basename,
                            targetNote: child.childName,
                            description: validation.reason,
                            confidence: 85,
                        },
                    });
                }
            }
        }

        return suggestions;
    }
}
