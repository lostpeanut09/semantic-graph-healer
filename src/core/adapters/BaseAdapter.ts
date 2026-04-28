import { App } from 'obsidian';
import { SemanticLinkEdge } from './types';

/**
 * BaseAdapter: Abstract foundation for all metadata adapters.
 * Ensures strict interface compliance and centralized availability logic.
 */
export abstract class BaseAdapter {
    constructor(
        protected app: App,
        protected debug: boolean = false
    ) {}

    /**
     * Checks if the underlying plugin/source is ready and available.
     * Prevents runtime errors when plugins are disabled or still loading.
     */
    public abstract isAvailable(): boolean;

    /**
     * Retrieves all semantic links extracted by this adapter.
     * Implementations should prioritize precision (offsets/context) where possible.
     */
    public abstract getLinks(): Promise<SemanticLinkEdge[]>;

    /**
     * Explicit cleanup for hot-reload or plugin disable events.
     */
    public destroy?(): void;

    /**
     * Invalidate specific path or entire adapter cache.
     */
    public abstract invalidate(path?: string): void;
}
