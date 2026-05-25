import type { RelatedNote } from '../../types';

/**
 * ISmartConnectionsPort
 * 
 * Port abstraction for the Smart Connections integration layer.
 * Defines the contract for retrieving semantic similarities and related notes.
 */
export interface ISmartConnectionsPort {
    /**
     * Retrieves notes related to the specified path based on semantic embeddings.
     * 
     * @param path - The source note path.
     * @param limit - Maximum number of results to return.
     * @returns A promise resolving to an array of RelatedNote objects.
     */
    getRelatedNotes(path: string, limit: number): Promise<RelatedNote[]>;

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
