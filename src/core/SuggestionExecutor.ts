import { App, Notice, TFile } from 'obsidian';
import { Suggestion } from '../types';
import { HealerLogger, resolveTargetFile } from './HealerUtils';
import SemanticGraphHealer from '../main';

export class SuggestionExecutor {
    private queue: Promise<void> = Promise.resolve();

    constructor(private plugin: SemanticGraphHealer) {}

    private get app(): App {
        return this.plugin.app;
    }

    async execute(suggestion: Suggestion): Promise<boolean> {
        return new Promise((resolve) => {
            this.queue = this.queue.then(async () => {
                try {
                    // IMPLEMENTATION: Safety timeout (10s) to prevent HoL blocking
                    let timerId: ReturnType<typeof setTimeout> | undefined;
                    const timeout = new Promise<boolean>((_, reject) => {
                        timerId = setTimeout(() => reject(new Error('Execution Timeout')), 10000);
                    });

                    const result = await Promise.race([this.innerExecute(suggestion), timeout]);
                    clearTimeout(timerId); // FIX: Spegni il timer non appena l'operazione ha successo
                    resolve(result);
                } catch (e) {
                    HealerLogger.error('Queued execution failed or timed out', e);
                    resolve(false);
                }
            });
        });
    }

    private async innerExecute(suggestion: Suggestion): Promise<boolean> {
        try {
            const targetFile = resolveTargetFile(this.app, suggestion);

            if (!(targetFile instanceof TFile)) {
                if (suggestion.type === 'infra') {
                    new Notice('Advisory acknowledged.');
                } else {
                    new Notice(`File could not be resolved: ${suggestion.link}`);
                    return false;
                }
            } else if (suggestion.meta?.sourcePath && (suggestion.meta?.propertyKey || suggestion.meta?.property)) {
                // ... same logic but using resolveTargetFile result
                const prop = suggestion.meta.propertyKey || suggestion.meta.property!;
                const sourcePath = suggestion.meta.sourcePath;
                const sourceFile = this.app.vault.getAbstractFileByPath(sourcePath);
                const sourceName =
                    sourceFile instanceof TFile
                        ? this.plugin.app.metadataCache.fileToLinktext(sourceFile, targetFile.path, true)
                        : sourcePath;

                await this.plugin.app.fileManager.processFrontMatter(targetFile, (fm: Record<string, unknown>) => {
                    let existing = fm[prop];
                    const isTag = prop === 'tags';
                    const newValue = isTag && suggestion.meta?.winner ? suggestion.meta.winner : `[[${sourceName}]]`;

                    if (isTag) {
                        // Normalize tag array
                        if (typeof existing === 'string') {
                            existing = [existing];
                        } else if (!Array.isArray(existing)) {
                            existing = [];
                        }
                        if (!(existing as string[]).includes(newValue)) {
                            fm[prop] = [...(existing as string[]), newValue];
                        }
                    } else {
                        // Standard link logic
                        if (Array.isArray(existing)) {
                            // ✅ FIX BUG 3: Normalizzazione esatta (evita che "Note" matchi con "[[Programming Note]]")
                            const normalizeLink = (s: unknown) =>
                                typeof s === 'string' ? s.replace(/[[\]]/g, '').split('|')[0].trim() : '';
                            const cleanSourceName = normalizeLink(sourceName);
                            const hasMatch = existing.some((e: unknown) => normalizeLink(e) === cleanSourceName);
                            if (!hasMatch) existing.push(newValue);
                        } else if (existing) {
                            const normalizeLink = (s: unknown) =>
                                typeof s === 'string' ? s.replace(/[[\]]/g, '').split('|')[0].trim() : '';
                            const cleanSourceName = normalizeLink(sourceName);
                            if (normalizeLink(existing) !== cleanSourceName) {
                                fm[prop] = [existing, newValue];
                            }
                        } else {
                            fm[prop] = newValue;
                        }
                    }
                });
                new Notice(`Fixed ${targetFile.basename}`);
            } else {
                await this.plugin.app.workspace.openLinkText(targetFile?.path || suggestion.link, '');
            }

            await this.finalizeSuggestion(suggestion, targetFile?.path || suggestion.link);
            return true;
        } catch (error) {
            HealerLogger.error('Execution failed', error);
            return false;
        }
    }

    async resolveChoice(suggestion: Suggestion, winner: string, losers: string[]): Promise<boolean> {
        return new Promise((resolve) => {
            this.queue = this.queue.then(async () => {
                try {
                    let timerId: ReturnType<typeof setTimeout> | undefined;
                    const timeout = new Promise<boolean>((_, reject) => {
                        timerId = setTimeout(() => reject(new Error('Resolution Timeout')), 10000);
                    });

                    const result = await Promise.race([this.innerResolveChoice(suggestion, winner, losers), timeout]);
                    clearTimeout(timerId);
                    resolve(result);
                } catch (e) {
                    HealerLogger.error('Queued resolution failed or timed out', e);
                    resolve(false);
                }
            });
        });
    }

    private async innerResolveChoice(suggestion: Suggestion, winner: string, losers: string[]): Promise<boolean> {
        try {
            const targetPath = suggestion.meta?.targetPath;
            const prop = suggestion.meta?.property;
            if (!targetPath || !prop) {
                new Notice('Missing structured metadata for resolution.');
                return false;
            }

            const targetFile = this.app.vault.getAbstractFileByPath(targetPath);
            if (!(targetFile instanceof TFile)) return false;

            await this.plugin.app.fileManager.processFrontMatter(targetFile, (fm: Record<string, unknown>) => {
                const existing = fm[prop];
                if (Array.isArray(existing)) {
                    fm[prop] = (existing as string[]).filter((val: unknown) => {
                        const normalizeLink = (s: unknown) =>
                            typeof s === 'string' ? s.replace(/[[\]]/g, '').trim().split('|')[0].trim() : '';
                        const valStr = normalizeLink(val);
                        // ✅ FIX BUG 3 (Diamond Master): Exact match after normalization
                        return !losers.some((l) => {
                            const lStr = normalizeLink(l);
                            return lStr === valStr;
                        });
                    });
                } else {
                    fm[prop] = winner;
                }
            });

            new Notice(`Resolved ${targetFile.basename}: kept ${winner}`);
            await this.finalizeSuggestion(suggestion, targetFile.path, `Resolved choice: kept ${winner}`);
            return true;
        } catch (e) {
            HealerLogger.error('Resolve choice failed', e);
            return false;
        }
    }

    /**
     * TRIPLE RELINK EXECUTION: SALVAGING THE CHAIN (A -> B -> C)
     * Updates A's next, B's prev/next, and C's prev.
     */
    async executeRelink(suggestion: Suggestion): Promise<boolean> {
        return new Promise((resolve) => {
            this.queue = this.queue.then(async () => {
                try {
                    let timerId: ReturnType<typeof setTimeout> | undefined;
                    const timeout = new Promise<boolean>((_, reject) => {
                        timerId = setTimeout(() => reject(new Error('Relink Timeout')), 10000);
                    });

                    const result = await Promise.race([this.innerExecuteRelink(suggestion), timeout]);
                    clearTimeout(timerId);
                    resolve(result);
                } catch (e) {
                    HealerLogger.error('Queued relink failed or timed out', e);
                    resolve(false);
                }
            });
        });
    }

    private async innerExecuteRelink(suggestion: Suggestion): Promise<boolean> {
        try {
            const pathA = suggestion.meta?.sourcePath;
            const pathB = suggestion.meta?.targetPath;
            const nodeC_Data = suggestion.meta?.winner; // Logical C (typically a path or name)
            const prop = suggestion.meta?.property; // e.g. 'next'

            if (!pathA || !pathB || !nodeC_Data || !prop) return false;

            const fileA = this.app.vault.getAbstractFileByPath(pathA);
            const fileB = this.app.vault.getAbstractFileByPath(pathB);
            // C is tricky as winner from LLM might be a name. HealerUtils should resolve.
            const fileC = this.app.metadataCache.getFirstLinkpathDest(nodeC_Data.replace(/[[\]]/g, ''), pathB);

            if (!(fileA instanceof TFile) || !(fileB instanceof TFile) || !(fileC instanceof TFile)) {
                HealerLogger.error('Relink failed: missing files in chain.', { pathA, pathB, nodeC_Data });
                return false;
            }

            const invProp = prop === 'next' ? 'prev' : 'next';
            const nameA = this.app.metadataCache.fileToLinktext(fileA, fileB.path, true);
            const nameB_forA = this.app.metadataCache.fileToLinktext(fileB, fileA.path, true);
            const nameB_forC = this.app.metadataCache.fileToLinktext(fileB, fileC.path, true);
            const nameC = this.app.metadataCache.fileToLinktext(fileC, fileB.path, true);

            // 1. Update A -> B (Standard Set logic for chains)
            await this.plugin.app.fileManager.processFrontMatter(fileA, (fm: Record<string, unknown>) => {
                fm[prop] = `[[${nameB_forA}]]`;
            });

            // 2. Update B -> A (prev) & B -> C (next)
            await this.plugin.app.fileManager.processFrontMatter(fileB, (fm: Record<string, unknown>) => {
                fm[invProp] = `[[${nameA}]]`;
                fm[prop] = `[[${nameC}]]`;
            });

            // 3. Update C -> B
            await this.plugin.app.fileManager.processFrontMatter(fileC, (fm: Record<string, unknown>) => {
                fm[invProp] = `[[${nameB_forC}]]`;
            });

            new Notice(`Chain repaired: ${fileA.basename} ↔ ${fileB.basename} ↔ ${fileC.basename}`);
            await this.finalizeSuggestion(
                suggestion,
                fileB.path,
                `Structural Bridge Repair: ${fileA.basename}->${fileB.basename}->${fileC.basename}`,
            );
            return true;
        } catch (e) {
            HealerLogger.error('Relink execution failed', e);
            return false;
        }
    }

    private async finalizeSuggestion(suggestion: Suggestion, targetPath: string, customAction?: string) {
        this.plugin.cache.suggestions = this.plugin.cache.suggestions.filter((s) => s.id !== suggestion.id);

        this.plugin.cache.pushHistory({
            action: customAction || `Resolved: ${suggestion.source.substring(0, 50)}`,
            file: targetPath,
            timestamp: Date.now(),
            type: 'fix',
        });

        // BUG FIX (Bug 4): Await to prevent race conditions during rapid batches
        await this.plugin.saveSettings();
        await this.plugin.refreshDashboard();
    }
}
