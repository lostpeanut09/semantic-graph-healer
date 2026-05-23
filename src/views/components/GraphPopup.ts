import type { Suggestion } from '../../types';
import { ButtonComponent } from 'obsidian';

/**
 * GraphPopup: Interactive overlay for graph elements.
 * Displays reasoning and allows direct execution of fixes.
 */
export class GraphPopup {
    private el: HTMLElement;
    private contentEl: HTMLElement;

    constructor(
        parentEl: HTMLElement,
        private onExecute: (suggestion: Suggestion) => void,
    ) {
        this.el = parentEl.createDiv({ cls: 'healer-graph-popup is-hidden' });
        this.contentEl = this.el.createDiv({ cls: 'healer-graph-popup-content' });
    }

    /**
     * Shows the popup at the specified coordinates.
     */
    show(x: number, y: number, title: string, suggestion?: Suggestion) {
        this.contentEl.empty();
        this.contentEl.createEl('h4', { text: title });

        if (suggestion) {
            const reasoning =
                suggestion.reasoning?.primaryReasoning || suggestion.reasoning?.winnerWhy || suggestion.source;

            this.contentEl.createEl('p', { text: reasoning });

            const btnContainer = this.contentEl.createDiv({ cls: 'healer-graph-popup-btns' });

            if (suggestion.category === 'error' || suggestion.category === 'suggestion') {
                new ButtonComponent(btnContainer)
                    .setButtonText('Execute fix')
                    .setCta()
                    .onClick(() => {
                        this.onExecute(suggestion);
                        this.hide();
                    });
            }

            new ButtonComponent(btnContainer).setButtonText('Dismiss').onClick(() => this.hide());
        } else {
            this.contentEl.createEl('p', { text: 'No specific issues detected for this node.' });

            const btnContainer = this.contentEl.createDiv({ cls: 'healer-graph-popup-btns' });
            new ButtonComponent(btnContainer).setButtonText('Dismiss').onClick(() => this.hide());
        }

        // Basic boundary adjustment
        const containerRect = this.el.parentElement?.getBoundingClientRect();
        let finalX = x;
        let finalY = y;

        if (containerRect) {
            // Check right boundary
            if (x + 320 > containerRect.width) {
                finalX = containerRect.width - 330;
            }
            // Check bottom boundary
            if (y + 200 > containerRect.height) {
                finalY = containerRect.height - 210;
            }
        }

        // @ts-ignore - setCssStyles is an Obsidian utility on HTMLElement
        this.el.setCssStyles({
            left: `${Math.max(10, finalX)}px`,
            top: `${Math.max(10, finalY)}px`,
            opacity: '1',
        });

        this.el.removeClass('is-hidden');
    }

    /**
     * Hides the popup.
     */
    hide() {
        // @ts-ignore
        this.el.setCssStyles({ opacity: '0' });
        setTimeout(() => {
            this.el.addClass('is-hidden');
        }, 200);
    }
}
