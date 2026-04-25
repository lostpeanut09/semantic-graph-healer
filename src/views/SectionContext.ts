// Section context shared across all setting section renderers.
// Provides access to plugin, app, helpers, and refresh callback.
import type { ButtonComponent } from 'obsidian';
import type { ExtendedApp } from '../types';
import type SemanticGraphHealer from '../main';

export interface SectionContext {
    plugin: SemanticGraphHealer;
    app: ExtendedApp;
    setCssProps: (el: HTMLElement, props: Record<string, string>) => void;
    refresh: () => void;
    runModelDetection: (button: ButtonComponent, isPrimary: boolean) => Promise<void>;
}
