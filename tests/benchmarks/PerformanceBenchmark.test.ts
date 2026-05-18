import { describe, test } from 'vitest';
import { GraphEngine } from '../../src/core/GraphEngine';
import { TopologyAnalyzer } from '../../src/core/TopologyAnalyzer';
import { DEFAULT_SETTINGS } from '../../src/types';
import { App } from 'obsidian';
import * as fs from 'fs';

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

function createLargeMockContext(numNodes: number, edgesPerNode: number) {
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
        adapter: { exists: () => true, read: () => Promise.resolve(''), write: () => Promise.resolve() },
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
            enableGraphGuardrails: false,
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
            runAnalysis: () => Promise.reject(new Error('Worker not available in benchmark')),
        },
    };
}

describe('Performance Benchmarks (Manual)', () => {
    test('measure buildGraph latency', async () => {
        const LARGE_VAULT_SIZE = 1000;
        const context = createLargeMockContext(LARGE_VAULT_SIZE, 3);
        const graphEngine = new GraphEngine(context as any);

        const start = performance.now();
        const iterations = 100;
        for (let i = 0; i < iterations; i++) {
            graphEngine.buildGraph();
        }
        const end = performance.now();
        const msg = `GraphEngine#buildGraph (${LARGE_VAULT_SIZE} nodes): Average Latency = ${((end - start) / iterations).toFixed(2)}ms`;
        fs.appendFileSync('benchmark_results.txt', msg + '\n');
    });

    test('measure deterministic analysis latency', async () => {
        const VAULT_SIZE = 500;
        const context = createLargeMockContext(VAULT_SIZE, 2);
        const topologyAnalyzer = new TopologyAnalyzer(
            context as any,
            {} as any,
            {
                getPages: () =>
                    (context.app.vault.getMarkdownFiles() as any[]).map((f) => ({
                        file: f,
                        up: [],
                        down: [],
                        next: [],
                        prev: [],
                        same: [],
                        related: [],
                    })),
                getPage: (path: string) => ({
                    file: context.app.vault.getAbstractFileByPath(path),
                    up: [],
                    down: [],
                    next: [],
                    prev: [],
                    same: [],
                    related: [],
                }),
            } as any,
        );

        const start = performance.now();
        await topologyAnalyzer.runDeterministicAnalysis();
        const end = performance.now();
        const msg = `TopologyAnalyzer#runDeterministicAnalysis (${VAULT_SIZE} nodes): Latency = ${(end - start).toFixed(2)}ms`;
        fs.appendFileSync('benchmark_results.txt', msg + '\n');
    });
});
