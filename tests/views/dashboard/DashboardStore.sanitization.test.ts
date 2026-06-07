import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardStore } from '../../../src/views/dashboard/DashboardStore.svelte';
import type { App, EventRef } from 'obsidian';
import type { Suggestion, HistoryItem, SemanticGraphHealerSettings, ReasoningResult } from '../../../src/types';

interface MockPluginContext {
    app: App;
    settings: SemanticGraphHealerSettings;
    cache: {
        suggestions: Suggestion[];
        history: HistoryItem[];
        save(): void;
    };
    executor: {
        execute(suggestion: Suggestion): Promise<boolean>;
        executeRelink(suggestion: Suggestion): Promise<boolean>;
        undo(historyItem: HistoryItem): Promise<boolean>;
        resolveChoice(suggestion: Suggestion, winner: string, losers: string[]): Promise<boolean>;
    };
    reasoner: {
        analyze(suggestion: Suggestion): Promise<ReasoningResult | null>;
    };
    topology: {
        getContextForAIValidation(
            sourcePath: string,
            targetPaths: string[],
        ): Promise<{
            sourceContent: string;
            targetContents: string[];
            existingRelations: unknown;
        }>;
    };
    llm: {
        validateBranching(
            sourceNote: string,
            targetNotes: string[],
            sourceContent: string,
            targetContents: string[],
            existingRelations: unknown,
        ): Promise<boolean>;
        validateTagInheritance(
            childName: string,
            tag: string,
            parentName: string,
            childContent: string,
            parentContent: string,
        ): Promise<boolean>;
    };
    saveSettings(): Promise<void>;
    registerEvent(event: EventRef): void;
}

describe('DashboardStore Sanitization E2E Simulation', () => {
    let mockPlugin: MockPluginContext;
    let store: DashboardStore;

    beforeEach(() => {
        mockPlugin = {
            app: {
                workspace: {
                    on: vi.fn().mockReturnValue({}),
                    getLeavesOfType: vi.fn().mockReturnValue([]),
                    getRightLeaf: vi.fn(),
                    revealLeaf: vi.fn(),
                },
                vault: {
                    getAbstractFileByPath: vi.fn(),
                },
                metadataCache: {
                    getFirstLinkpathDest: vi.fn(),
                },
            },
            settings: {
                proximityIgnoreList: [],
                requireAITagValidation: true,
            },
            cache: {
                suggestions: [],
                history: [],
                save: vi.fn(),
            },
            executor: {
                execute: vi.fn(),
                executeRelink: vi.fn(),
                undo: vi.fn(),
                resolveChoice: vi.fn(),
            },
            reasoner: {
                analyze: vi.fn(),
            },
            topology: {
                getContextForAIValidation: vi.fn(),
            },
            llm: {
                validateBranching: vi.fn(),
                validateTagInheritance: vi.fn(),
            },
            saveSettings: vi.fn().mockResolvedValue(undefined),
            registerEvent: vi.fn(),
        } as unknown as MockPluginContext;

        store = new DashboardStore(mockPlugin);
    });

    it('should sanitize content before calling llm.validateBranching', async () => {
        const suggestion = {
            id: 'branch_123',
            type: 'ai',
            link: '[[Test]]',
            meta: {
                sourcePath: 'source.md',
                targetPaths: ['target.md'],
                sourceNote: 'Source',
                targetNotes: ['Target'],
            },
        } as unknown as Suggestion;

        // Add suggestion to store (manually since it's private but we can set it via cache and refresh)
        mockPlugin.cache.suggestions = [suggestion];
        store.refresh();

        (mockPlugin.topology.getContextForAIValidation as ReturnType<typeof vi.fn>).mockResolvedValue({
            sourceContent: 'Secret source: sk-1234567890abcdefghijklmnopqrstuvwxyz',
            targetContents: ['Secret target: Bearer my-token-123'],
            existingRelations: {},
        });

        await store.verifyAI(suggestion);

        expect(mockPlugin.llm.validateBranching).toHaveBeenCalledWith(
            'Source',
            ['Target'],
            'Secret source: sk-***',
            ['Secret target: Bearer ***'],
            {},
        );
    });

    it('should sanitize content before calling llm.validateTagInheritance', async () => {
        const suggestion = {
            id: 'tag_123',
            type: 'ai',
            link: '[[Test]]',
            meta: {
                sourcePath: 'child.md',
                targetPath: 'parent.md',
                sourceNote: 'Child',
                targetNote: 'Parent',
                property: 'myTag',
            },
        } as unknown as Suggestion;

        mockPlugin.cache.suggestions = [suggestion];
        store.refresh();

        (mockPlugin.topology.getContextForAIValidation as ReturnType<typeof vi.fn>).mockResolvedValue({
            sourceContent: 'Child secret: sk-1234567890abcdefghijklmnopqrstuvwxyz',
            targetContents: [
                'Parent secret: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature',
            ],
            existingRelations: {},
        });

        await store.verifyAI(suggestion);

        expect(mockPlugin.llm.validateTagInheritance).toHaveBeenCalledWith(
            'Child',
            'myTag',
            'Parent',
            'Child secret: sk-***',
            'Parent secret: ***JWT***',
        );
    });
});
