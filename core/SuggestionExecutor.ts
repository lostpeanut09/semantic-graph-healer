import { App, Notice } from 'obsidian';
import { Suggestion } from '../types';
import { HealerLogger } from './HealerUtils';
import SemanticGraphHealer from '../main';

export class SuggestionExecutor {
    constructor(private plugin: SemanticGraphHealer) {}

    private get app(): App {
        return this.plugin.app;
    }

    async execute(suggestion: Suggestion): Promise<boolean> {
        try {
            const targetName = suggestion.meta?.targetNote || suggestion.link.replace(/^\[\[/, '').replace(/\]\]$/, '');

            const targetFile = this.app.vault.getMarkdownFiles().find((f) => f.basename === targetName);

            if (!targetFile) {
                if (suggestion.type === 'infra') {
                    new Notice('Advisory acknowledged.');
                } else {
                    new Notice(`File not found: ${targetName}`);
                    return false;
                }
            } else if (suggestion.meta?.property && suggestion.meta?.sourceNote) {
                const prop = suggestion.meta.property;
                const source = suggestion.meta.sourceNote;

                await this.app.fileManager.processFrontMatter(targetFile, (fm: Record<string, unknown>) => {
                    const existing = fm[prop];
                    const newLink = `[[${source}]]`;

                    if (Array.isArray(existing)) {
                        if (!existing.some((e: string) => String(e).includes(source))) {
                            existing.push(newLink);
                        }
                    } else if (existing) {
                        if (!String(existing).includes(source)) {
                            fm[prop] = [existing, newLink];
                        }
                    } else {
                        fm[prop] = newLink;
                    }
                });
                new Notice(`Fixed ${targetFile.basename}`);
            } else {
                await this.app.workspace.openLinkText(targetName, '');
            }

            this.finalizeSuggestion(suggestion, targetName);
            return true;
        } catch (error) {
            HealerLogger.error('Execution failed', error);
            return false;
        }
    }

    async resolveChoice(suggestion: Suggestion, winner: string, losers: string[]): Promise<boolean> {
        try {
            const noteName = suggestion.meta?.targetNote;
            const prop = suggestion.meta?.property;
            if (!noteName || !prop) {
                new Notice('Missing structured metadata for resolution.');
                return false;
            }

            const targetFile = this.app.vault.getMarkdownFiles().find((f) => f.basename === noteName);
            if (!targetFile) return false;

            await this.app.fileManager.processFrontMatter(targetFile, (fm: Record<string, unknown>) => {
                const existing = fm[prop];
                if (Array.isArray(existing)) {
                    fm[prop] = existing.filter((val: string) => {
                        const valStr = String(val);
                        return !losers.some((l) => l.includes(valStr) || valStr.includes(l.replace(/\[|\]/g, '')));
                    });
                } else {
                    fm[prop] = winner;
                }
            });

            new Notice(`Resolved ${noteName}: kept ${winner}`);
            this.finalizeSuggestion(suggestion, noteName, `Resolved choice: kept ${winner}`);
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
        try {
            const nodeA_Name = suggestion.meta?.sourceNote;
            const nodeB_Name = suggestion.meta?.targetNote;
            const nodeC_Name = suggestion.meta?.winner; // Logical C
            const prop = suggestion.meta?.property; // e.g. 'next'

            if (!nodeA_Name || !nodeB_Name || !nodeC_Name || !prop) return false;

            const files = this.app.vault.getMarkdownFiles();
            const fileA = files.find((f) => f.basename === nodeA_Name);
            const fileB = files.find((f) => f.basename === nodeB_Name);
            const fileC = files.find((f) => f.basename === nodeC_Name);

            if (!fileA || !fileB || !fileC) {
                HealerLogger.error('Relink failed: missing files in chain.');
                return false;
            }

            const invProp = prop === 'next' ? 'prev' : 'next';

            // 1. Update A -> B
            await this.app.fileManager.processFrontMatter(fileA, (fm: Record<string, unknown>) => {
                fm[prop] = `[[${nodeB_Name}]]`;
            });

            // 2. Update B -> A (prev) & B -> C (next)
            await this.app.fileManager.processFrontMatter(fileB, (fm: Record<string, unknown>) => {
                fm[invProp] = `[[${nodeA_Name}]]`;
                fm[prop] = `[[${nodeC_Name}]]`;
            });

            // 3. Update C -> B
            await this.app.fileManager.processFrontMatter(fileC, (fm: Record<string, unknown>) => {
                fm[invProp] = `[[${nodeB_Name}]]`;
            });

            new Notice(`Chain repaired: ${nodeA_Name} ↔ ${nodeB_Name} ↔ ${nodeC_Name}`);
            this.finalizeSuggestion(
                suggestion,
                nodeB_Name,
                `Structural Bridge Repair: ${nodeA_Name}->${nodeB_Name}->${nodeC_Name}`,
            );
            return true;
        } catch (e) {
            HealerLogger.error('Relink execution failed', e);
            return false;
        }
    }

    private finalizeSuggestion(suggestion: Suggestion, targetFile: string, customAction?: string) {
        this.plugin.settings.pendingSuggestions = this.plugin.settings.pendingSuggestions.filter(
            (s) => s.id !== suggestion.id,
        );

        this.plugin.settings.history.push({
            action: customAction || `Resolved: ${suggestion.source.substring(0, 50)}`,
            file: targetFile,
            timestamp: Date.now(),
            type: 'fix',
        });

        if (this.plugin.settings.history.length > 100) {
            this.plugin.settings.history = this.plugin.settings.history.slice(-100);
        }

        void this.plugin.saveSettings().catch((e) => HealerLogger.error('Save failed', e));
        void this.plugin.refreshDashboard();
    }
}
