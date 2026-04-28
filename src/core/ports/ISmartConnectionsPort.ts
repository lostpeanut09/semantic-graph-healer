import type { RelatedNote } from "../../types";

/**
 * Port abstraction for the Smart Connections integration layer.
 * Exposes only the methods used by downstream consumers (UnifiedMetadataAdapter).
 */
export interface ISmartConnectionsPort {
  getRelatedNotes(path: string, limit: number): Promise<RelatedNote[]>;
  invalidate(path?: string): void;
  destroy?(): void;
}
