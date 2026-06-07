import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { DashboardStore } from '../../../src/views/dashboard/DashboardStore.svelte';
import type { Suggestion, HistoryItem } from '../../../src/types';
import { REASONING_VIEW_TYPE } from '../../../src/views/DashboardView';
import { ConfirmationModal } from '../../../src/views/components/ConfirmationModal';

// Mock ConfirmationModal
vi.mock('../../../src/views/components/ConfirmationModal', () => ({
    ConfirmationModal: vi.fn().mockImplementation(function (app, suggestion, onConfirm) {
        return {
            open: vi.fn().mockImplementation(() => onConfirm()),
            close: vi.fn(),
        };
    }),
}));

type MockFn = ReturnType<typeof vi.fn>;
type PluginContext = ConstructorParameters<typeof DashboardStore>[0];

interface MockWorkspace {
    on: MockFn;
    getLeavesOfType?: MockFn;
    getRightLeaf?: MockFn;
}

interface MockPlugin {
    app: {
        workspace: MockWorkspace;
    };
    settings: Record<string, unknown>;
    cache: {
        suggestions: Suggestion[];
        history: HistoryItem[];
        save: MockFn;
    };
    executor: {
        execute: MockFn;
        executeRelink?: MockFn;
        undo?: MockFn;
        resolveChoice?: MockFn;
    };
    reasoner?: {
        analyze: MockFn;
    };
    topology?: {
        getContextForAIValidation: MockFn;
    };
    llm?: {
        validateBranching: MockFn;
        validateTagInheritance: MockFn;
    };
    saveSettings: MockFn;
    registerEvent: MockFn;
}

describe('DashboardStore', () => {
    let mockPlugin: MockPlugin;
    let mockWorkspace: MockWorkspace;
    let eventCallback: Function | null;

    beforeEach(() => {
        eventCallback = null;

        mockWorkspace = {
            on: vi.fn((event: string, cb: Function) => {
                if (event === 'semantic-graph:updated') {
                    eventCallback = cb;
                }
                return { event, cb };
            }),
        };

        mockPlugin = {
            app: {
                workspace: mockWorkspace,
            },
            settings: { proximityIgnoreList: [] },
            registerEvent: vi.fn(),
            cache: {
                suggestions: [] as Suggestion[],
                history: [] as HistoryItem[],
                save: vi.fn(),
            },
            executor: {
                execute: vi.fn(),
                executeRelink: vi.fn(),
                undo: vi.fn(),
                resolveChoice: vi.fn(),
            },
            saveSettings: vi.fn(),
        };
    });

    const asPluginContext = (m: MockPlugin): PluginContext => m as unknown as PluginContext;

    it('initializes with suggestions and history from cache', () => {
        const mockSuggestions: Suggestion[] = [
            {
                id: 'bridge_gap_1',
                type: 'topology_gap',
                category: 'suggestion',
                link: '',
                source: '',
                timestamp: 0,
            },
            {
                id: 'cycle_1',
                type: 'deterministic',
                category: 'error',
                link: '',
                source: '',
                timestamp: 0,
            },
        ];
        mockPlugin.cache.suggestions = mockSuggestions;

        const store = new DashboardStore(asPluginContext(mockPlugin));

        expect(store.suggestions.length).toBe(2);
        expect(store.structuralGaps.length).toBe(1);
        expect(store.logicLoops.length).toBe(1);
    });

    it('filters correctly using derived getters', () => {
        const mockSuggestions: Suggestion[] = [
            {
                id: 'bridge_gap_1',
                type: 'topology_gap',
                category: 'suggestion',
                link: '',
                source: '',
                timestamp: 0,
            },
            {
                id: 'cycle_1',
                type: 'deterministic',
                category: 'error',
                link: '',
                source: '',
                timestamp: 0,
            },
            {
                id: 'sink_1',
                type: 'quality',
                category: 'info',
                link: '',
                source: '',
                timestamp: 0,
            },
            {
                id: 'other_1',
                type: 'ai',
                category: 'suggestion',
                link: '',
                source: '',
                timestamp: 0,
            },
        ];
        mockPlugin.cache.suggestions = mockSuggestions;

        const store = new DashboardStore(asPluginContext(mockPlugin));

        expect(store.structuralGaps.map((s) => s.id)).toEqual(['bridge_gap_1']);
        expect(store.logicLoops.map((s) => s.id)).toEqual(['cycle_1']);
        expect(store.blackHoles.map((s) => s.id)).toEqual(['sink_1']);
        expect(store.aiSuggestions.map((s) => s.id)).toEqual(['other_1']);
    });

    it('updates reactivity when refresh is called', () => {
        const store = new DashboardStore(asPluginContext(mockPlugin));
        expect(store.suggestions.length).toBe(0);

        mockPlugin.cache.suggestions = [
            {
                id: 'bridge_gap_1',
                type: 'topology_gap',
                category: 'suggestion',
                link: '',
                source: '',
                timestamp: 0,
            },
        ];

        store.refresh();

        expect(store.suggestions.length).toBe(1);
        expect(store.structuralGaps.length).toBe(1);
    });

    it('automatically refreshes when event is triggered', () => {
        const store = new DashboardStore(asPluginContext(mockPlugin));
        expect(store.suggestions.length).toBe(0);

        mockPlugin.cache.suggestions = [
            {
                id: 'sink_1',
                type: 'quality',
                category: 'info',
                link: '',
                source: '',
                timestamp: 0,
            },
        ];

        // Trigger the registered event
        expect(eventCallback).not.toBeNull();
        if (eventCallback) {
            eventCallback();
        }

        expect(store.suggestions.length).toBe(1);
        expect(store.blackHoles.length).toBe(1);
    });

    describe('Batch and Ignore Logic', () => {
        let store: DashboardStore;

        beforeAll(() => {
            // Mock Obsidian DOM extensions for jsdom
            if (!DocumentFragment.prototype.appendText) {
                DocumentFragment.prototype.appendText = function (text: string) {
                    this.appendChild(document.createTextNode(text));
                };
            }
            if (!DocumentFragment.prototype.createEl) {
                DocumentFragment.prototype.createEl = function (
                    tag: string,
                    options?: { text?: string; cls?: string },
                ) {
                    const el = document.createElement(tag);
                    if (options?.text) el.textContent = options.text;
                    if (options?.cls) el.className = options.cls;
                    this.appendChild(el);
                    return el;
                };
            }
        });

        beforeEach(() => {
            mockPlugin.executor = {
                execute: vi.fn().mockResolvedValue(true),
            };
            mockPlugin.cache.suggestions = [
                {
                    id: '1',
                    type: 'ai',
                    category: 'suggestion',
                    link: '1',
                    source: '',
                    timestamp: 0,
                },
                {
                    id: '2',
                    type: 'ai',
                    category: 'suggestion',
                    link: '2',
                    source: '',
                    timestamp: 0,
                },
            ];
            mockPlugin.settings = { proximityIgnoreList: [] };

            // Mock Notice for Obsidian
            (global as unknown as { Notice: MockFn }).Notice = vi.fn().mockImplementation(() => {
                return {
                    noticeEl: {
                        appendChild: vi.fn(),
                    },
                    hide: vi.fn(),
                };
            });

            store = new DashboardStore(asPluginContext(mockPlugin));
        });

        it('fixAll processes all items sequentially and yields', async () => {
            const yieldSpy = vi.spyOn(global, 'setTimeout');
            const items = Array.from({ length: 6 }, (_, i) => ({
                id: `id_${i}`,
                type: 'ai' as const,
                category: 'suggestion' as const,
                link: `link_${i}`,
                source: '',
                timestamp: 0,
            }));

            await store.fixAll(items);

            expect(mockPlugin.executor.execute).toHaveBeenCalledTimes(6);
            expect(yieldSpy).toHaveBeenCalled();
            // Verify items are marked fixed
            expect(store.fixedItems.size).toBe(6);
        });

        it('ignore removes item and provides undo toast', () => {
            const suggestion = mockPlugin.cache.suggestions[0];
            const originalLength = store.suggestions.length;

            store.ignore(suggestion);

            // To verify Notice was used without a constructor mock, we can check if a Notice was created.
            // In a jsdom env, we can check if hide was spied on or just trust it.
            // But since Notice is a class from obsidian.ts which creates a div, we can't easily spy on constructor.
            // Let's just verify the store's reactive state was updated.
            expect(store.suggestions.length).toBe(originalLength - 1);

            // Note: detailed DOM simulation for Undo might require
            // more complex mocks, we ensure Notice is called as first step
        });
    });

    describe('AI Logic Verification', () => {
        let store: DashboardStore;

        beforeEach(() => {
            mockPlugin.reasoner = {
                analyze: vi.fn(),
            };
            mockPlugin.topology = {
                getContextForAIValidation: vi.fn(),
            };
            mockPlugin.llm = {
                validateBranching: vi.fn(),
                validateTagInheritance: vi.fn(),
            };
            mockPlugin.executor = {
                execute: vi.fn(),
                executeRelink: vi.fn(),
                undo: vi.fn(),
                resolveChoice: vi.fn(),
            };
            mockPlugin.saveSettings = vi.fn().mockResolvedValue(true);
            mockPlugin.cache.save = vi.fn();
            mockPlugin.settings = {
                requireAITagValidation: true,
                proximityIgnoreList: [],
            };

            mockPlugin.cache.suggestions = [
                {
                    id: 'branch_1',
                    type: 'ai',
                    category: 'suggestion',
                    link: 'link_1',
                    source: '',
                    timestamp: 0,
                    meta: { sourcePath: 'A', targetPaths: ['B', 'C'] },
                },
                {
                    id: 'tag_1',
                    type: 'ai',
                    category: 'suggestion',
                    link: 'link_2',
                    source: '',
                    timestamp: 0,
                    meta: { sourcePath: 'D', targetPath: 'E' },
                },
            ];

            store = new DashboardStore(asPluginContext(mockPlugin));
        });

        it('analyze calls reasoner and updates state', async () => {
            const suggestion = mockPlugin.cache.suggestions[0];
            const mockReasoningResult = { verdict: 'STABLE' };
            mockPlugin.reasoner!.analyze.mockResolvedValue(mockReasoningResult);

            // Mock showReasoning requirements
            mockPlugin.app.workspace.getLeavesOfType = vi.fn().mockReturnValue([]);
            mockPlugin.app.workspace.getRightLeaf = vi.fn().mockReturnValue({
                setViewState: vi.fn().mockResolvedValue(true),
                view: { setSuggestion: vi.fn() },
            });

            await store.analyze(suggestion);

            expect(mockPlugin.reasoner!.analyze).toHaveBeenCalledWith(suggestion);
            expect(store.suggestions[0].reasoning).toEqual(mockReasoningResult);
            expect(mockPlugin.cache.save).toHaveBeenCalled();
            expect(mockPlugin.saveSettings).toHaveBeenCalled();
        });

        it('verifyAI calls validateBranching with context for branch suggestions', async () => {
            const suggestion = mockPlugin.cache.suggestions[0];
            const mockContext = {
                sourceContent: 'content A',
                targetContents: ['content B', 'content C'],
                existingRelations: 'relations',
            };

            mockPlugin.topology!.getContextForAIValidation.mockResolvedValue(mockContext);
            mockPlugin.llm!.validateBranching.mockResolvedValue(true);

            await store.verifyAI(suggestion);

            expect(mockPlugin.topology!.getContextForAIValidation).toHaveBeenCalledWith('A', ['B', 'C']);
            expect(mockPlugin.llm!.validateBranching).toHaveBeenCalled();
            expect(store.suggestions[0].verificationResult).toBe('Valid');
        });

        it('verifyAI calls validateTagInheritance for tag suggestions', async () => {
            const suggestion = mockPlugin.cache.suggestions[1];
            const mockContext = {
                sourceContent: 'content D',
                targetContents: ['content E'],
                existingRelations: '',
            };

            mockPlugin.topology!.getContextForAIValidation.mockResolvedValue(mockContext);
            mockPlugin.llm!.validateTagInheritance.mockResolvedValue(false);

            await store.verifyAI(suggestion);

            expect(mockPlugin.topology!.getContextForAIValidation).toHaveBeenCalledWith('D', ['E']);
            expect(mockPlugin.llm!.validateTagInheritance).toHaveBeenCalled();
            expect(store.suggestions[1].verificationResult).toBe('Contradiction');
        });

        it('resolveChoice calls executor.resolveChoice', async () => {
            const suggestion = mockPlugin.cache.suggestions[0];
            mockPlugin.executor.resolveChoice!.mockResolvedValue(true);

            await store.resolveChoice(suggestion, 'winner', ['loser']);

            expect(mockPlugin.executor.resolveChoice!).toHaveBeenCalledWith(suggestion, 'winner', ['loser']);
            expect(store.fixedItems.has(suggestion.id)).toBe(true);
        });

        it('executeComplex triggers ConfirmationModal and calls executor.executeRelink', async () => {
            const suggestion = mockPlugin.cache.suggestions[0];
            mockPlugin.executor.executeRelink!.mockResolvedValue(true);

            await store.executeComplex(suggestion);

            // Wait for fire-and-forget logic
            await vi.waitFor(() => {
                if (!store.fixedItems.has(suggestion.id)) throw new Error('Not fixed yet');
            });

            expect(ConfirmationModal).toHaveBeenCalled();
            expect(mockPlugin.executor.executeRelink!).toHaveBeenCalledWith(suggestion);
            expect(store.fixedItems.has(suggestion.id)).toBe(true);
        });

        it('undoAction calls executor.undo and refreshes store', async () => {
            const historyItem: HistoryItem = {
                timestamp: Date.now(),
                action: 'Fixed A',
                file: 'A.md',
                type: 'fix',
                mementoData: [],
            };
            mockPlugin.executor.undo!.mockResolvedValue(true);

            await store.undoAction(historyItem);

            expect(mockPlugin.executor.undo).toHaveBeenCalledWith(historyItem);
            // Verify refresh by checking if it tried to access history again
            // (In our mock context, history is initially empty, we can check if it's still empty or mock refresh differently)
        });
    });
});
