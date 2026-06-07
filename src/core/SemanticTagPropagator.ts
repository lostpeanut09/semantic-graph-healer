import { App, TFile } from 'obsidian';
import type { SemanticGraphHealerSettings, Suggestion } from '../types';
import { HealerLogger } from './utils/HealerLogger';
import { generateId, resolveLinkpathsToPaths, extractLinkpaths } from './HealerUtils';
import type { VaultQueryEngine } from './DataAdapter';
import { LlmService } from './LlmService';

export class SemanticTagPropagator {
    /**
     * Initializes the SemanticTagPropagator.
     * @param app - The Obsidian App instance.
     * @param settings - The plugin's semantic settings.
     * @param engine - The data adapter engine used for querying the vault.
     * @param llm - The LLM service (reserved for future AI taxonomy refinement).
     */
    constructor(
        private app: App,
        private settings: SemanticGraphHealerSettings,
        private engine: VaultQueryEngine,
        private llm: LlmService,
    ) {}

    /**
     * Analyzes the graph topology to suggest tag propagation.
     * If a parent node has a tag and a majority of its children share it,
     * this method suggests propagating the tag to the remaining outlier children.
     * @returns An array of semantic tag suggestions.
     */
    public runTagPropagationAnalysis(): Suggestion[] {
        HealerLogger.info('Starting Phase 3 AI Semantic Tag Propagation Analysis...');
        const suggestions: Suggestion[] = [];

        // 1. Fetch all pages
        const query =
            this.settings.scanFolder && this.settings.scanFolder !== '/' ? `"${this.settings.scanFolder}"` : '';
        const pages = this.engine.getPages(query);

        // ✅ Guardrail for large vaults
        if (pages.length > 5000) {
            HealerLogger.warn(`Tag propagation skipped: vault too large (${pages.length} nodes).`);
            return [];
        }

        // Map: parentPath -> array of child TFile objects
        const childrenByParent = new Map<string, TFile[]>();
        // Collect all hierarchy direction keys for comprehensive parent detection
        const hierarchyKeys = this.settings.hierarchies.flatMap((h) => [
            ...(h.up || []),
            ...(h.down || []),
            ...(h.same || []),
            ...(h.related || []),
        ]);
        const resolverCache = new Map<string, string | null>();

        // 2. Build parent-child topology
        for (const page of pages) {
            const linkpaths = extractLinkpaths(page, hierarchyKeys);
            const parentPaths = resolveLinkpathsToPaths(this.app, linkpaths, page.file.path, resolverCache);

            for (const parentPath of parentPaths) {
                if (!childrenByParent.has(parentPath)) {
                    childrenByParent.set(parentPath, []);
                }
                const pageFile = this.app.vault.getAbstractFileByPath(page.file.path);
                if (pageFile instanceof TFile) {
                    childrenByParent.get(parentPath)!.push(pageFile);
                }
            }
        }

        // 3. Analyze inheritance logic
        const exclusions = this.settings.tagPropagationExclusions || ['MOC', 'Index', 'Dashboard'];

        for (const [parentPath, children] of childrenByParent) {
            if (children.length < 2) continue; // Need at least two children to define a cluster majority

            const parentFile = this.app.vault.getAbstractFileByPath(parentPath);
            if (!(parentFile instanceof TFile)) continue;

            const parentCache = this.app.metadataCache.getFileCache(parentFile);
            // Dataview tags usually come with # prefix in metadata cache tags
            const parentTags = parentCache?.tags?.map((t) => t.tag.replace(/^#/, '')) || [];

            // Filter out exclusions
            const filteredParentTags = parentTags.filter(
                (tag) => !exclusions.some((exc) => tag.toLowerCase().includes(exc.toLowerCase())),
            );

            if (filteredParentTags.length === 0) continue;

            for (const parentTag of filteredParentTags) {
                // Calculate percentage of children that ALREADY have this tag
                const childrenWithTag = children.filter((child) => {
                    const childCache = this.app.metadataCache.getFileCache(child);
                    const childTags = childCache?.tags?.map((t) => t.tag.replace(/^#/, '')) || [];
                    // Handle nested tags: if parent has #science, child having #science/biology counts
                    return childTags.some((t) => t === parentTag || t.startsWith(`${parentTag}/`));
                });

                const coverageRatio = childrenWithTag.length / children.length;
                const coverageThreshold = this.settings.tagPropagationThreshold || 0.5;

                // If majority of cluster (>X%) has the tag, suggest it to the outliers
                if (coverageRatio >= coverageThreshold && coverageRatio < 1.0) {
                    HealerLogger.debug(
                        `Propagating tag #${parentTag} to cluster of ${parentFile.basename} (Coverage: ${Math.round(coverageRatio * 100)}%)`,
                    );

                    for (const child of children) {
                        const childCache = this.app.metadataCache.getFileCache(child);
                        const childTags = childCache?.tags?.map((t) => t.tag.replace(/^#/, '')) || [];
                        const hasTag = childTags.some((t) => t === parentTag || t.startsWith(`${parentTag}/`));

                        if (!hasTag) {
                            suggestions.push({
                                id: generateId(`tag_propagation_${parentPath}_${child.path}_${parentTag}`),
                                type: 'semantic',
                                category: 'suggestion',
                                link: `[[${child.basename}]]`,
                                source: `Taxonomy Propagation: ${Math.round(coverageRatio * 100)}% of [${parentFile.basename}]'s children inherit the tag '#${parentTag}'. Suggesting propagation.`,
                                timestamp: Date.now(),
                                meta: {
                                    property: 'tags',
                                    propertyKey: 'tags',
                                    winner: parentTag, // The actual tag to add
                                    sourcePath: parentPath,
                                    targetPath: child.path,
                                    sourceNote: parentFile.basename,
                                    targetNote: child.basename,
                                    description: `Missing inherited tag #${parentTag}`,
                                    confidence: Math.round(coverageRatio * 100),
                                },
                            });
                        }
                    }
                }
            }
        }

        return suggestions;
    }
}
