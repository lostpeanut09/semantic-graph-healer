import { App, TFile } from 'obsidian';
import { BaseAdapter } from './BaseAdapter';
import { SemanticLinkEdge } from './types';
import { normalizeVaultPath } from '../HealerUtils';

/**
 * NativeVaultAdapter: High-performance bridge to Obsidian's core MetadataCache.
 * SOTA 2026: The baseline "Source of Truth" for all physical vault links.
 */
export class NativeVaultAdapter extends BaseAdapter {
    public readonly id = 'native-vault';

    protected async onInitialize(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Native vault metadata is always available.
     */
    public isAvailable(): boolean {
        return true;
    }

    /**
     * Extracts links using the fast app.metadataCache.resolvedLinks map.
     * Note: This primarily returns 'wikilink' and 'property' types as tracked by Obsidian.
     */
    public async getLinks(): Promise<SemanticLinkEdge[]> {
        this.ensureInitialized();
        const edges: SemanticLinkEdge[] = [];
        const resolvedLinks = this.app.metadataCache.resolvedLinks;
        const appWithSettings = this.app as App & { settings?: { includeNonMarkdownHubs?: boolean } };
        const includeNonMarkdown = appWithSettings.settings?.includeNonMarkdownHubs ?? false;

        this.logDebug(`getLinks: resolvedLinks count: ${Object.keys(resolvedLinks).length}`);
        for (const [rawSource, targets] of Object.entries(resolvedLinks)) {
            const sourcePath = normalizeVaultPath(this.app, rawSource);
            this.logDebug(`getLinks: sourcePath: ${sourcePath}, targets: ${Object.keys(targets).length}`);
            for (const [rawTarget, count] of Object.entries(targets)) {
                // If count > 1, we might want to extract individual positions,
                // but resolvedLinks is an aggregate. For precision, we'd need getFileCache.
                // For now, we return the aggregate edge.
                const targetPath = normalizeVaultPath(this.app, rawTarget, sourcePath);
                this.logDebug(`getLinks: checking targetPath: ${targetPath}`);

                if (sourcePath === targetPath) {
                    this.logDebug(`getLinks: skipping self-link: ${sourcePath}`);
                    continue;
                }
                if (!includeNonMarkdown && !targetPath.toLowerCase().endsWith('.md')) {
                    this.logDebug(`getLinks: skipping non-markdown: ${targetPath}`);
                    continue;
                }

                this.logDebug(`getLinks: pushing edge: ${sourcePath} -> ${targetPath}`);
                edges.push({
                    sourcePath,
                    targetPath,
                    type: 'wikilink', // Default for resolvedLinks
                });
            }
        }

        return edges;
    }

    /**
     * Extracts rich metadata (context/position) for a specific file.
     * Use this for the "Precision Healing" phase.
     */
    public async getRichLinksForFile(file: TFile): Promise<SemanticLinkEdge[]> {
        this.ensureInitialized();
        const cache = this.app.metadataCache.getFileCache(file);
        if (!cache) return [];

        const edges: SemanticLinkEdge[] = [];
        const sourcePath = file.path;

        // Process Wikilinks
        if (cache.links) {
            for (const link of cache.links) {
                const targetFile = this.app.metadataCache.getFirstLinkpathDest(link.link, sourcePath);
                if (targetFile) {
                    edges.push({
                        sourcePath,
                        targetPath: targetFile.path,
                        type: 'wikilink',
                        context: link.original,
                        position: {
                            start: link.position.start.offset,
                            end: link.position.end.offset,
                        },
                    });
                }
            }
        }

        // Process Embeds
        if (cache.embeds) {
            for (const embed of cache.embeds) {
                const targetFile = this.app.metadataCache.getFirstLinkpathDest(embed.link, sourcePath);
                if (targetFile) {
                    edges.push({
                        sourcePath,
                        targetPath: targetFile.path,
                        type: 'wikilink', // Or 'embed' if we add it
                        context: embed.original,
                        position: {
                            start: embed.position.start.offset,
                            end: embed.position.end.offset,
                        },
                    });
                }
            }
        }

        return edges;
    }

    public invalidate(_path?: string): void {
        // Native cache is managed by Obsidian, no-op.
    }
}
