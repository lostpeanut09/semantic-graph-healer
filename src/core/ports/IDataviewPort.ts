import type { DataviewApi, DataviewPage } from "../../types";

/**
 * Port abstraction for the Dataview integration layer.
 * Exposes only the methods used by downstream consumers (UnifiedMetadataAdapter).
 */
export interface IDataviewPort {
  getPage(path: string): DataviewPage | null;
  invalidateBacklinkIndex(): void;
  queryPages(query: string): Promise<DataviewPage[]>;
  getPages(query: string): DataviewPage[];
  getBacklinks(path: string): string[];
  getDataviewApi(): DataviewApi | null;
  invalidate(path?: string): void;
  destroy?(): void;
}
