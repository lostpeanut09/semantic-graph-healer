import { BreadcrumbsAdapter } from '../src/core/adapters/BreadcrumbsAdapter';
import { App } from 'obsidian';

describe('BreadcrumbsAdapter V4 Fallbacks', () => {
    let appMock: App;
    let adapter: any; // Use any to access private methods for testing

    beforeEach(() => {
        appMock = {
            metadataCache: {
                getFirstLinkpathDest: (link: string, sourcePath: string) => {
                    return { path: link }; // mock basic resolution
                },
            },
            vault: {
                getAbstractFileByPath: () => null,
            },
        } as unknown as App;
        adapter = new BreadcrumbsAdapter(appMock);
    });

    it('should parse array of string targets', () => {
        const edgeList = ['Notes/A.md', 'Notes/B.md'];
        const nodes = adapter.toHierarchyFromV4Neighbours(edgeList, 'Notes/Current.md');
        expect(nodes?.children).toContain('Notes/A.md');
        expect(nodes?.children).toContain('Notes/B.md');
        expect(nodes?.parents).toHaveLength(0);
    });

    it('should parse object wrapping structure { edges: [...] }', () => {
        const edgeList = {
            edges: [{ target: 'Notes/C.md' }, { to: 'Notes/D.md' }, { path: 'Notes/E.md' }],
        };
        const nodes = adapter.toHierarchyFromV4Neighbours(edgeList, 'Notes/Current.md');
        expect(nodes?.children).toEqual(['Notes/C.md', 'Notes/D.md', 'Notes/E.md']);
    });

    it('should gracefully handle empty or invalid inputs', () => {
        expect(adapter.toHierarchyFromV4Neighbours(null, 'Notes/Self.md')?.children).toHaveLength(0);
        expect(adapter.toHierarchyFromV4Neighbours(undefined, 'Notes/Self.md')?.children).toHaveLength(0);
        expect(adapter.toHierarchyFromV4Neighbours([], 'Notes/Self.md')?.children).toHaveLength(0);
        expect(adapter.toHierarchyFromV4Neighbours({}, 'Notes/Self.md')?.children).toHaveLength(0);
    });

    it('should not add the current path to children (self-reference)', () => {
        const edgeList = ['Notes/Self.md', 'Notes/Other.md'];
        const nodes = adapter.toHierarchyFromV4Neighbours(edgeList, 'Notes/Self.md');
        expect(nodes?.children).not.toContain('Notes/Self.md');
        expect(nodes?.children).toContain('Notes/Other.md');
    });
});
