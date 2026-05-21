import { Notice } from 'obsidian';
import type { HealerNotifier } from '../../types';

/**
 * Standard implementation of HealerNotifier using Obsidian's Notice API.
 */
export class ObsidianNotifier implements HealerNotifier {
    show(message: string, type?: 'info' | 'error' | 'warning'): void {
        // Obsidian Notice doesn't have a native 'type' for styling out of the box
        // without DOM manipulation, but we can prefix if needed or just use it as is.
        // For now, we follow the standard Notice behavior.
        new Notice(message);
    }
}
