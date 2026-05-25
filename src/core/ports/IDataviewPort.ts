import type { DataviewApi, DataviewPage } from '../../types';

/**
 * IDataviewPort
 *
 * Port abstraction for the Dataview integration layer.
 * Defines the contract for querying and interacting with Dataview metadata.
 */
export interface IDataviewPort {
    /**
     * Retrieves the Dataview page object for a specific file.
     *
     * @param path - The absolute path of the note.
     * @returns The DataviewPage object or null if not found.
     */
    getPage(path: string): DataviewPage | null;

    /**
     * Forces an invalidation of the internal backlink index if maintained by the port.
     */
    invalidateBacklinkIndex(): void;

    /**
     * Executes an asynchronous Dataview query.
     *
     * @param query - The DQL query string.
     * @returns A promise resolving to an array of DataviewPage objects.
     */
    queryPages(query: string): Promise<DataviewPage[]>;

    /**
     * Executes a synchronous Dataview query.
     *
     * @param query - The DQL query string.
     * @returns An array of DataviewPage objects.
     */
    getPages(query: string): DataviewPage[];

    /**
     * Retrieves paths of notes that link to the specified note.
     *
     * @param path - The target note path.
     * @returns Array of source paths.
     */
    getBacklinks(path: string): string[];

    /**
     * Provides access to the raw Dataview API if available.
     *
     * @returns The DataviewApi instance or null if not installed/enabled.
     */
    getDataviewApi(): DataviewApi | null;

    /**
     * Invalidates cached data for the given path.
     *
     * @param path - Optional. The file path to invalidate. If omitted, clears all entries.
     */
    invalidate(path?: string): void;

    /**
     * Optional cleanup method called during plugin shutdown.
     */
    destroy?(): void;
}
