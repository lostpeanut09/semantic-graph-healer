import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SuggestionExecutor } from '../../src/core/SuggestionExecutor';
import { TFile, Notice } from 'obsidian';
import { HistoryItem } from '../../src/types';

// Mock Obsidian components
vi.mock('obsidian', () => ({
    TFile: class {
        path: string = '';
        basename: string = '';
        extension: string = '';
    },
    Notice: vi.fn(),
}));

describe('SuggestionExecutor', () => {
    let executor: SuggestionExecutor;
    let mockContext: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockContext = {
            app: {
                vault: {
                    getAbstractFileByPath: vi.fn(),
                },
                metadataCache: {
                    getFileCache: vi.fn(),
                    fileToLinktext: vi.fn(),
                    getFirstLinkpathDest: vi.fn(),
                },
                fileManager: {
                    processFrontMatter: vi.fn(),
                },
                workspace: {
                    openLinkText: vi.fn(),
                },
            },
            cache: {
                suggestions: [],
                pushHistory: vi.fn(),
            },
            saveSettings: vi.fn(),
            refreshDashboard: vi.fn(),
        };

        executor = new SuggestionExecutor(mockContext);
    });

    describe('undo', () => {
        it('should return false if no mementoData', async () => {
            const historyItem: HistoryItem = {
                timestamp: Date.now(),
                action: 'Test Action',
                file: 'test.md',
                type: 'fix',
            };

            const result = await executor.undo(historyItem);
            expect(result).toBe(false);
            expect(Notice).toHaveBeenCalledWith('No undo data available for this action.');
        });

        it('should restore frontmatter from mementoData', async () => {
            const historyItem: HistoryItem = {
                timestamp: Date.now(),
                action: 'Test Action',
                file: 'A.md',
                type: 'fix',
                mementoData: [{ path: 'A.md', property: 'up', originalValue: '[[OldParent]]' }],
            };

            const mockFile = new TFile();
            mockFile.path = 'A.md';
            mockContext.app.vault.getAbstractFileByPath.mockReturnValue(mockFile);

            mockContext.app.fileManager.processFrontMatter.mockImplementation(async (file: TFile, cb: (fm: any) => void) => {
                const fm = { up: '[[NewParent]]' };
                await cb(fm);
                expect(fm.up).toBe('[[OldParent]]');
            });

            const result = await executor.undo(historyItem);

            expect(result).toBe(true);
            expect(mockContext.app.vault.getAbstractFileByPath).toHaveBeenCalledWith('A.md');
            expect(mockContext.app.fileManager.processFrontMatter).toHaveBeenCalled();
            expect(mockContext.refreshDashboard).toHaveBeenCalled();
            expect(Notice).toHaveBeenCalledWith('Reverted: Test Action');
        });

        it('should handle multiple memento entries', async () => {
            const historyItem: HistoryItem = {
                timestamp: Date.now(),
                action: 'Complex Action',
                file: 'B.md',
                type: 'fix',
                mementoData: [
                    { path: 'A.md', property: 'next', originalValue: '[[OldB]]' },
                    { path: 'B.md', property: 'prev', originalValue: '[[OldA]]' },
                ],
            };

            const fileA = new TFile();
            fileA.path = 'A.md';
            const fileB = new TFile();
            fileB.path = 'B.md';

            mockContext.app.vault.getAbstractFileByPath.mockImplementation((path: string) => {
                if (path === 'A.md') return fileA;
                if (path === 'B.md') return fileB;
                return null;
            });

            const result = await executor.undo(historyItem);

            expect(result).toBe(true);
            expect(mockContext.app.fileManager.processFrontMatter).toHaveBeenCalledTimes(2);
        });
    });
});
