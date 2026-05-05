import { App } from 'obsidian';
import { SemanticLinkEdge } from './types';
import { HealerLogger, isObsidianInternalApp, normalizeVaultPath } from '../HealerUtils';
import { ExtendedApp } from '../../types';

/**
 * BaseAdapter: Abstract foundation for all metadata adapters.
 * Ensures strict interface compliance and centralized availability logic.
 *
 * Subclasses must implement: `id`, `isAvailable`, `getLinks`, `invalidate`.
 * Subclasses may override: `onDestroy` (called exactly once by `destroy()`).
 */
export abstract class BaseAdapter {
    /** Guard to prevent work after shutdown/hot-reload. */
    private _isDestroyed = false;

    /** Tracks whether initialization has completed successfully. */
    protected initialized = false;

    /** Guard for concurrent initialization calls. */
    private initPromise: Promise<void> | null = null;

    /**
     * @param app   - The Obsidian App instance, injected at construction time.
     * @param debug - When true, verbose diagnostic logs are emitted via `HealerLogger.debug`.
     *                Defaults to false. Controls `logDebug()` emission.
     */
    constructor(
        protected app: App,
        protected debug: boolean = false,
    ) {}

    /** Public view of the destroyed state (useful for orchestrators). */
    public get isDestroyed(): boolean {
        return this._isDestroyed;
    }

    /**
     * Initializes the adapter. Idempotent: safe to call multiple times.
     * Subsequent calls return the same promise as the first call.
     */
    public async initialize(): Promise<void> {
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            this.logDebug('initializing...');
            await this.onInitialize();
            this.initialized = true;
            this.logDebug('initialized.');
        })();

        return this.initPromise;
    }

    /**
     * Subclasses must implement this to perform their specific async initialization.
     * Called exactly once by `initialize()`.
     */
    protected abstract onInitialize(): Promise<void>;

    /**
     * Throws an error if the adapter is not yet initialized.
     * Use this in all data-retrieval methods (like `getLinks`) to prevent
     * access to uninitialized state.
     */
    protected ensureInitialized(): void {
        if (!this.initialized) {
            throw new Error(`${this.id} adapter: not initialized`);
        }
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
     * @remarks Subclass implementations SHOULD return `false` when
     *          `this.isDestroyed` is `true`. This ensures callers using
     *          `isAvailable()` directly (rather than `getLinksSafe()`)
     *          are also protected from post-destroy work.
     */
    public abstract isAvailable(): boolean;

    /**
     * Retrieves all semantic links extracted by this adapter.
     *
     * @returns A Promise that resolves with an array of `SemanticLinkEdge`.
     * @remarks This is a lower-level method. Callers should prefer `getLinksSafe()`
     *          which applies destroyed/availability guards and catches all exceptions.
     *          If called directly, implementations MUST resolve with `[]` or throw —
     *          they must never resolve with `null` or `undefined`.
     */
    public abstract getLinks(): Promise<SemanticLinkEdge[]>;

    /**
     * Safe wrapper for `getLinks()`:
     * - Returns `[]` if the adapter is destroyed.
     * - Returns `[]` if the adapter is not available.
     * - Catches any exceptions thrown by `getLinks()` and returns `[]`.
     *
     * Prefer this over calling `getLinks()` directly. Prevents one failing
     * adapter from breaking the entire pipeline.
     */
    public async getLinksSafe(): Promise<SemanticLinkEdge[]> {
        if (this._isDestroyed) {
            this.logDebug('getLinksSafe: adapter is destroyed — returning []');
            return [];
        }

        // Catch isAvailable() too (adapter impl can be buggy)
        let available = false;
        try {
            available = this.isAvailable();
        } catch (e) {
            this.logError('isAvailable failed', e);
            return [];
        }

        if (!available) {
            this.logDebug('getLinksSafe: adapter not available — returning []');
            return [];
        }

        try {
            const links = await this.getLinks();
            // Defensive: guard against non-array (e.g., a subclass returning null/undefined)
            return Array.isArray(links) ? links : [];
        } catch (e) {
            this.logError('getLinks failed', e);
            return [];
        }
    }

    /**
     * Explicit cleanup hook. Idempotent by design (safe to call multiple times).
     * Sets the adapter to destroyed state, then calls `onDestroy()` once.
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
     * Called exactly once by `destroy()`. Override only if the subclass holds
     * releasable resources (subscriptions, caches, event listeners).
     */
    protected onDestroy?(): void;

    /**
     * Invalidates this adapter's internal cache.
     *
     * @param path - If provided, clears only the cached data for that vault file path.
     *               If omitted (`undefined`), clears the entire adapter cache.
     */
    public abstract invalidate(path?: string): void;

    // ---------------------------------------------------------------------------
    // Shared helpers (centralized availability & path logic)
    // ---------------------------------------------------------------------------

    /**
     * Returns the plugin instance if it is loaded, or `null` otherwise.
     *
     * @param pluginId - The Obsidian plugin ID to look up.
     * @returns The plugin instance cast to `T`, or `null` if not loaded or
     *          if the app is not an internal Obsidian app.
     * @remarks The caller is responsible for ensuring `T` matches the plugin's
     *          actual runtime type. No runtime type validation is performed —
     *          TypeScript generics are erased at runtime.
     */
    protected getPlugin<T = unknown>(pluginId: string): T | null {
        if (!isObsidianInternalApp(this.app)) {
            this.logDebug(`getPlugin: isObsidianInternalApp guard fired — cannot access plugins API`);
            return null;
        }
        const plugin = (this.app as ExtendedApp).plugins.getPlugin(pluginId);
        return (plugin ?? null) as T | null;
    }

    /**
     * Returns `true` if the plugin with the given ID is both enabled and loaded.
     *
     * @param pluginId - The Obsidian plugin ID to check.
     */
    protected isPluginAvailable(pluginId: string): boolean {
        if (!isObsidianInternalApp(this.app)) {
            this.logDebug(`isPluginAvailable: isObsidianInternalApp guard fired — returning false`);
            return false;
        }
        const internal = this.app as unknown as ExtendedApp & {
            plugins: { enabledPlugins: unknown; getPlugin: (id: string) => unknown };
        };

        const enabledPlugins = internal.plugins.enabledPlugins;

        let enabled = true; // fallback: if we can't determine "enabled", treat "loaded" as primary signal
        try {
            if (enabledPlugins instanceof Set) {
                enabled = enabledPlugins.has(pluginId);
            } else if (Array.isArray(enabledPlugins)) {
                enabled = enabledPlugins.includes(pluginId);
            } else if (enabledPlugins && typeof (enabledPlugins as unknown).has === 'function') {
                enabled = !!(enabledPlugins as unknown).has(pluginId);
            }
        } catch (e) {
            this.logDebug(`enabledPlugins check failed for ${pluginId}`, e);
            enabled = true;
        }

        return enabled && !!internal.plugins.getPlugin(pluginId);
    }

    /**
     * Normalizes a raw path into a canonical vault path when possible.
     *
     * @param path       - The raw path to normalize. If falsy, returns `undefined`
     *                     (signals a full-cache invalidation to callers).
     * @param sourcePath - The source file path used as context for vault-relative
     *                     resolution. Defaults to empty string.
     * @returns The normalized vault path, or `undefined` if `path` was falsy.
     */
    protected normalizeInvalidatePath(path?: string, sourcePath = ''): string | undefined {
        if (!path) return undefined;
        return normalizeVaultPath(this.app, path, sourcePath);
    }

    /**
     * Emits a debug-level log message prefixed with the adapter class name.
     * No-op when `this.debug` is `false` (the default).
     *
     * @param message - The message to log.
     * @param args    - Additional values to include in the log output.
     */
    protected logDebug(message: string, ...args: unknown[]): void {
        if (!this.debug) return;
        const prefix = this.id || this.constructor.name;
        HealerLogger.debug(`[${prefix}] ${message}`, ...args);
    }

    /**
     * Emits an error-level log message prefixed with the adapter class name.
     * Always emits regardless of the `debug` flag — errors are never suppressed.
     *
     * @param message - A short description of the failure context.
     * @param err     - The caught error or unknown value.
     */
    protected logError(message: string, err: unknown): void {
        const prefix = this.id || this.constructor.name;
        HealerLogger.error(`[${prefix}] ${message}`, err);
    }
}
