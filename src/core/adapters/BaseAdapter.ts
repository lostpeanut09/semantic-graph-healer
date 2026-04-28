import { App } from 'obsidian';
import { SemanticLinkEdge } from './types';
import { HealerLogger, isObsidianInternalApp, normalizeVaultPath } from '../HealerUtils';
import { ExtendedApp } from '../../types';

/**
 * BaseAdapter: Abstract foundation for all metadata adapters.
 * Ensures strict interface compliance and centralized availability logic.
 *
 * Subclasses must implement: `id`, `isAvailable`, `getLinks`, `invalidate`.
 * Subclasses may override: `onDestroy` (called by `destroy()`).
 */
export abstract class BaseAdapter {
    /** Guard to prevent work after shutdown/hot-reload */
    private _isDestroyed = false;

    /**
     * @param app   - The Obsidian App instance, injected at construction time.
     * @param debug - When true, subclasses should emit verbose diagnostic logs
     *                via `HealerLogger.debug`. Defaults to false.
     */
    constructor(
        protected app: App,
        protected debug: boolean = false,
    ) {}

    /** Public view of the destroyed state (useful for orchestrators) */
    public get isDestroyed(): boolean {
        return this._isDestroyed;
    }

    /**
     * A unique, stable identifier for this adapter (e.g. `"dataview"`, `"frontmatter"`).
     * Used for logging, filtering edges by source, and cache key namespacing.
     */
    public abstract readonly id: string;

    /**
     * Checks if the underlying plugin/source is ready and available.
     * Prevents runtime errors when plugins are disabled or still loading.
     *
     * @returns `true` if and only if `getLinks()` can be safely invoked.
     */
    public abstract isAvailable(): boolean;

    /**
     * Retrieves all semantic links extracted by this adapter.
     * Implementations should prioritize precision (offsets/context) where possible.
     *
     * @returns A Promise that resolves with an array of `SemanticLinkEdge`.
     * @remarks Implementations SHOULD resolve with `[]` on error.
     *          The base class `getLinksSafe()` provides additional safety.
     */
    public abstract getLinks(): Promise<SemanticLinkEdge[]>;

    /**
     * Safe wrapper for `getLinks()`:
     * - Returns `[]` if the adapter is destroyed.
     * - Returns `[]` if the adapter is not available.
     * - Catches any exceptions and returns `[]`.
     *
     * This keeps callers simple and prevents one failing adapter from breaking the pipeline.
     */
    public async getLinksSafe(): Promise<SemanticLinkEdge[]> {
        if (this._isDestroyed) return [];
        if (!this.isAvailable()) return [];

        try {
            const links = await this.getLinks();
            return Array.isArray(links) ? links : [];
        } catch (e) {
            this.logError('getLinks failed', e);
            return [];
        }
    }

    /**
     * Explicit cleanup hook for hot-reload or plugin disable events.
     * Idempotent by design (safe to call multiple times).
     */
    public destroy(): void {
        if (this._isDestroyed) return;
        this._isDestroyed = true;

        try {
            this.onDestroy?.();
        } catch (e) {
            this.logError('onDestroy failed', e);
        }
    }

    /**
     * Optional cleanup hook for subclasses.
     * Called exactly once by `destroy()`.
     */
    protected onDestroy?(): void;

    /**
     * Invalidates specific path or entire adapter cache.
     *
     * @param path - If provided, clears only the cached data for that vault file path.
     *               If omitted (`undefined`), clears the entire adapter cache.
     */
    public abstract invalidate(path?: string): void;

    // ---------------------------------------------------------------------------
    // Shared helpers (centralized availability & path logic)
    // ---------------------------------------------------------------------------

    /**
     * Returns the plugin instance if it is loaded.
     */
    protected getPlugin<T = unknown>(pluginId: string): T | null {
        if (!isObsidianInternalApp(this.app)) return null;
        const plugin = (this.app as ExtendedApp).plugins.getPlugin(pluginId);
        return (plugin ?? null) as T | null;
    }

    /**
     * True if the plugin is enabled and loaded.
     */
    protected isPluginAvailable(pluginId: string): boolean {
        if (!isObsidianInternalApp(this.app)) return false;

        const internal = this.app as ExtendedApp;
        const enabled = internal.plugins.enabledPlugins.has(pluginId);

        return enabled && !!internal.plugins.getPlugin(pluginId);
    }

    /**
     * Normalize anything path-like into a canonical vault path when possible.
     */
    protected normalizeInvalidatePath(path?: string, sourcePath = ''): string | undefined {
        if (!path) return undefined;
        return normalizeVaultPath(this.app, path, sourcePath);
    }

    protected logDebug(message: string, ...args: unknown[]): void {
        HealerLogger.debug(`[${this.constructor.name}] ${message}`, ...args);
    }

    protected logError(message: string, err: unknown): void {
        HealerLogger.error(`[${this.constructor.name}] ${message}`, err);
    }
}
