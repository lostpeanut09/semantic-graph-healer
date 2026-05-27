import { describe, test, expect } from 'vitest';
import { GraphEngine } from '../../src/core/GraphEngine';
import { DEFAULT_SETTINGS } from '../../src/types';
import { App } from 'obsidian';

// --- Mocks ---
class MockApp {
    plugins = { enabledPlugins: new Set() };
    vault: any;
    metadataCache: any;
}

class MockTFile {
    stat = { size: 1000, mtime: Date.now() };
    extension = 'md';
    parent = { path: '/' };
    constructor(
        public path: string,
        public basename: string,
        public name: string,
    ) {}
}

function create10kMockContext() {
    const numNodes = 10000;
    const edgesPerNode = 2;
    const files: any[] = [];
    const resolvedLinks: Record<string, Record<string, number>> = {};
    const pathToFileMap = new Map<string, any>();

    for (let i = 0; i < numNodes; i++) {
        const path = `Note-${i.toString().padStart(5, '0')}.md`;
        const basename = `Note-${i.toString().padStart(5, '0')}`;
        const file = new MockTFile(path, basename, path);
        files.push(file);
        pathToFileMap.set(path, file);
        resolvedLinks[path] = {};
    }

    for (let i = 1; i < numNodes; i++) {
        for (let j = 0; j < edgesPerNode; j++) {
            const targetIdx = Math.floor(Math.random() * i);
            const sourcePath = files[i].path;
            const targetPath = files[targetIdx].path;
            resolvedLinks[sourcePath][targetPath] = (resolvedLinks[sourcePath][targetPath] || 0) + 1;
        }
    }

    const app = new MockApp();
    app.vault = {
        getMarkdownFiles: () => files,
        getAbstractFileByPath: (path: string) => pathToFileMap.get(path),
        adapter: {
            exists: () => true,
            read: () => Promise.resolve(''),
            write: () => Promise.resolve(),
        },
    };
    app.metadataCache = {
        resolvedLinks,
        getFileCache: () => ({}),
        getFirstLinkpathDest: (link: string) => pathToFileMap.get(link),
        fileToLinktext: (file: any) => file.basename,
        unresolvedLinks: {},
    };

    return {
        app: app as unknown as App,
        settings: {
            ...DEFAULT_SETTINGS,
            enableGraphGuardrails: true,
            maxNodes: 15000, // High enough to not cap in Standard Mode
        },
        performanceService: {
            isSafetyModeActive: () => false,
            getPerformanceMode: () => 'Standard',
        },
        cache: {
            topologicalScores: {
                pageRank: {},
                betweenness: {},
                communities: {},
                lastAnalysisTimestamp: 0,
                graphVersion: '',
            },
            save: () => {},
        },
        graphWorkerService: {
            runAnalysis: () => Promise.resolve({ success: true }),
        },
    };
}

describe('V1-STRESS-01: 10k Node Stress Test', () => {
    test('should build graph with 10,000 nodes in reasonable time', () => {
        const context = create10kMockContext();
        const graphEngine = new GraphEngine(context as any);

        const start = performance.now();
        graphEngine.buildGraph();
        const end = performance.now();

        const graph = graphEngine.getGraph();
        const duration = end - start;
        console.log(`GraphEngine#buildGraph (10,000 nodes): ${duration.toFixed(2)}ms`);

        expect(graph.order).toBe(10000);
        // Requirement: Handle 10k+ nodes. We verify it doesn't crash and finishes.
        // Usually "reasonable time" for 10k nodes in graphology is < 500ms.
        expect(duration).toBeLessThan(1000);
    });

    test('should cap graph at 2000 nodes when Safety Mode is active', () => {
        const context = create10kMockContext();
        // Force Safety Mode
        context.performanceService.isSafetyModeActive = () => true;

        const graphEngine = new GraphEngine(context as any);

        graphEngine.buildGraph();
        const graph = graphEngine.getGraph();

        expect(graph.order).toBe(2000);
    });
});
