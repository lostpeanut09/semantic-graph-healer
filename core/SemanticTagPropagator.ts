import { App, TFile } from 'obsidian';
import { SemanticGraphHealerSettings, Suggestion } from '../types';
import { HealerLogger, generateId, resolveLinkpathsToPaths, extractLinkpaths } from './HealerUtils';
import { VaultQueryEngine } from './DataAdapter';
import { LlmService } from './LlmService';

export class SemanticTagPropagator {
    constructor(
        private app: App,
        private settings: SemanticGraphHealerSettings,
        private engine: VaultQueryEngine,
        private llm: LlmService,
    ) {}

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
        const hierarchyKeys = this.settings.hierarchies[0]?.up || [];
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
        for (const [parentPath, children] of childrenByParent) {
            if (children.length < 2) continue; // Need at least two children to define a cluster majority

            const parentFile = this.app.vault.getAbstractFileByPath(parentPath);
            if (!(parentFile instanceof TFile)) continue;

            const parentCache = this.app.metadataCache.getFileCache(parentFile);
            // Dataview tags usually come with # prefix in metadata cache tags
            const parentTags = parentCache?.tags?.map((t) => t.tag.replace(/^#/, '')) || [];

            if (parentTags.length === 0) continue;

            for (const parentTag of parentTags) {
                // Calculate percentage of children that ALREADY have this tag
                const childrenWithTag = children.filter((child) => {
                    const childCache = this.app.metadataCache.getFileCache(child);
                    return childCache?.tags?.some((t) => t.tag.replace(/^#/, '') === parentTag);
                });

                const coverageRatio = childrenWithTag.length / children.length;
                const coverageThreshold = this.settings.tagPropagationThreshold || 0.5;

                // If majority of cluster (>X%) has the tag, suggest it to the outliers
                if (coverageRatio > coverageThreshold && coverageRatio < 1.0) {
                    for (const child of children) {
                        const childCache = this.app.metadataCache.getFileCache(child);
                        const hasTag = childCache?.tags?.some((t) => t.tag.replace(/^#/, '') === parentTag);

                        if (!hasTag) {
                            // The suggestion is created instantly. The dashboard logic will trigger AI check
                            // if 'requireAITagValidation' is true when the user hits "Verify".
                            suggestions.push({
                                id: generateId(`tag_propagation_${parentPath}_${child.path}_${parentTag}`),
                                type: 'semantic', // We use 'semantic' to avoid type issues, but identify it by 'tags' property
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
