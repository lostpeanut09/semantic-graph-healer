import { App } from 'obsidian';
import { IMetadataAdapter } from './IMetadataAdapter';
import { DataviewApi, DataviewPage, HierarchyNode, MarkdownPage, RelatedNote } from '../../types';
import { HealerLogger, isObsidianInternalApp } from '../HealerUtils';

interface DatacoreApi {
    page(path: string): MarkdownPage | null;
    query(query: string): MarkdownPage[];
}

/**
 * DatacoreAdapter: SOTA 2026 Implementation.
 * Bridges the Datacore metadata engine to the Unified Metadata Layer.
 */
export class DatacoreAdapter implements IMetadataAdapter {
    constructor(private app: App) {}

    private getApi(): DatacoreApi | null {
        if (!isObsidianInternalApp(this.app)) return null;

        // Use ExtendedApp for type-safe plugin access (SOTA 2026 Core Hardening)
        const app = this.app as import('../../types').ExtendedApp;
        const plugin = app.plugins.getPlugin('datacore');
        return plugin && 'api' in plugin ? (plugin.api as DatacoreApi) : null;
    }

    getPage(path: string): DataviewPage | null {
        const dc = this.getApi();
        if (dc) {
            const page = dc.page(path);
            if (page) return this.mapToDataviewPage(page);
        }
        return null;
    }

    public invalidateBacklinkIndex() {
        this.backlinkIndex = null;
    }

    async queryPages(_query: string): Promise<DataviewPage[]> {
        await Promise.resolve();
        const api = this.getApi();
        if (!api) return [];
        try {
            const results = api.query(_query);
            return (results || []).map((p) => this.mapToDataviewPage(p));
        } catch (e) {
            HealerLogger.error('DatacoreAdapter: query failed', e);
            return [];
        }
    }

    public getDataviewApi(): DataviewApi | null {
        return null;
    }

    private backlinkIndex: Map<string, Set<string>> | null = null;

    private buildBacklinkIndex(): Map<string, Set<string>> {
        const idx = new Map<string, Set<string>>();

        // SOTA 2026: Resolved direct access to public metadataCache (no 'any' required)
        const resolvedLinks = this.app.metadataCache.resolvedLinks;

        for (const [sourcePath, targets] of Object.entries(resolvedLinks)) {
            for (const targetPath of Object.keys(targets)) {
                if (!idx.has(targetPath)) idx.set(targetPath, new Set());
                idx.get(targetPath)!.add(sourcePath);
            }
        }
        return idx;
    }

    public getBacklinks(targetPath: string): string[] {
        if (!this.backlinkIndex) {
            this.backlinkIndex = this.buildBacklinkIndex();
        }
        return [...(this.backlinkIndex.get(targetPath) ?? new Set())];
    }

    public getPages(query: string): DataviewPage[] {
        return [];
    }

    async getHierarchy(_path: string): Promise<HierarchyNode | null> {
        return Promise.resolve(null);
    }

    async getRelatedNotes(_path: string, _limit: number): Promise<RelatedNote[]> {
        return Promise.resolve([]);
    }

    invalidate(path?: string): void {}

    private mapToDataviewPage(p: MarkdownPage): DataviewPage {
        return {
            file: {
                path: p.$path,
                name: p.$path.split('/').pop() || '',
                basename: p.$path.split('/').pop()?.replace('.md', '') || '',
                ctime: p.$ctime,
                mtime: p.$mtime,
                size: p.$size,
                tags: p.$tags,
                etags: p.$tags,
                link: {
                    path: p.$path,
                    embed: false,
                    type: 'file',
                },
                frontmatter: p.$frontmatter,
            },
            ...p.$infields,
            ...p,
        } as unknown as DataviewPage;
    }
}
