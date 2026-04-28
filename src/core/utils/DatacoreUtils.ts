/**
 * DatacoreLink internal interface for native Datacore link objects.
 */
export interface DatacoreLink {
  path: string;
  display?: string;
  subpath?: string | null;
  embed?: boolean;
  type?: "file" | "header" | "block";
  withDisplay?: (d: string) => DatacoreLink;
  toEmbed?: () => DatacoreLink;
  toObject?: () => Record<string, unknown>;
  toString?: () => string;
}

/**
 * Type Guard: Safely identifies a value as a Record<string, unknown>.
 */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Consolidates Dataview's field name sanitization logic (Docs-Aligned).
 */
export function normalizeDataviewFieldName(key: string): string {
  return key
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Type Guard: Safely identifies a native Datacore link object.
 */
export function isDatacoreLink(v: unknown): v is DatacoreLink {
  return isRecord(v) && typeof v["path"] === "string";
}

/**
 * Defensive unwrap for internal Obsidian plugins.
 */
export function unwrapInternalPluginInstance(raw: unknown): unknown {
  if (!isRecord(raw)) return null;
  return raw["instance"] ?? raw;
}

/**
 * Recursively searches a bookmark tree for a specific file path.
 */
export function isPathBookmarked(
  items: unknown[],
  targetPath: string,
): boolean {
  for (const item of items) {
    if (!isRecord(item)) continue;
    if (
      item["type"] === "file" &&
      typeof item["path"] === "string" &&
      item["path"] === targetPath
    ) {
      return true;
    }
    const subItems = item["items"];
    if (
      (item["type"] === "group" || item["type"] === "folder") &&
      Array.isArray(subItems)
    ) {
      if (isPathBookmarked(subItems, targetPath)) return true;
    }
  }
  return false;
}
