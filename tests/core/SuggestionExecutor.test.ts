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

            mockContext.app.fileManager.processFrontMatter.mockImplementation(
                async (file: TFile, cb: (fm: any) => void) => {
                    const fm = { up: '[[NewParent]]' };
                    await cb(fm);
                    expect(fm.up).toBe('[[OldParent]]');
                },
            );

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

    describe('executeRelink', () => {
        it('should rollback if processFrontMatter fails', async () => {
            const suggestion: any = {
                id: '1',
                source: 'Bridge',
                type: 'bridge',
                link: 'B.md',
                meta: {
                    sourcePath: 'A.md',
                    targetPath: 'B.md',
                    winner: 'C.md',
                    property: 'next',
                },
            };

            const fileA = new TFile();
            fileA.path = 'A.md';
            fileA.basename = 'A';
            const fileB = new TFile();
            fileB.path = 'B.md';
            fileB.basename = 'B';
            const fileC = new TFile();
            fileC.path = 'C.md';
            fileC.basename = 'C';

            mockContext.app.vault.getAbstractFileByPath.mockImplementation((path: string) => {
                if (path === 'A.md') return fileA;
                if (path === 'B.md') return fileB;
                if (path === 'C.md') return fileC;
                return null;
            });
            mockContext.app.metadataCache.getFirstLinkpathDest.mockReturnValue(fileC);
            mockContext.app.metadataCache.getFileCache.mockReturnValue({
                frontmatter: { next: '[[Old]]', prev: '[[Old]]' },
            });

            // Simulate failure on the second file (B.md)
            mockContext.app.fileManager.processFrontMatter.mockImplementation(
                async (file: TFile, cb: (fm: any) => void) => {
                    if (file.path === 'B.md') {
                        throw new Error('Write Failed');
                    }
                    await cb({});
                },
            );

            const result = await executor.executeRelink(suggestion);

            expect(result).toBe(false);
            // 1 attempt for A, 1 attempt for B (failed), then 4 rollback attempts (A, B, B, C)
            // Wait, looking at the code:
            // mementoData has A (next), B (next), B (prev), C (prev)
            // total processFrontMatter calls should be:
            // 1 (A success) + 1 (B fail) + 4 (rollback) = 6
            expect(mockContext.app.fileManager.processFrontMatter).toHaveBeenCalledTimes(6);
        });
    });
});
