/**
 * DatacoreLink
 *
 * Internal interface for native Datacore link objects used within the plugin
 * to interact with Datacore's metadata system.
 */
export interface DatacoreLink {
    path: string;
    display?: string;
    subpath?: string | null;
    embed?: boolean;
    type?: 'file' | 'header' | 'block';
    withDisplay?: (d: string) => DatacoreLink;
    toEmbed?: () => DatacoreLink;
    toObject?: () => Record<string, unknown>;
    toString?: () => string;
}

/**
 * Type Guard: Safely identifies a value as a Record<string, unknown>.
 *
 * @param v - The value to check.
 * @returns True if the value is a non-array object, false otherwise.
 */
export function isRecord(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Consolidates Dataview's field name sanitization logic (Docs-Aligned).
 * Normalizes, trims, lowercases and replaces special characters with hyphens.
 *
 * @param key - The raw field name.
 * @returns The sanitized, URL-friendly field name.
 */
export function normalizeDataviewFieldName(key: string): string {
    return key
        .normalize('NFKC')
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]+/gu, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
}

/**
 * Type Guard: Safely identifies a native Datacore link object.
 *
 * @param v - The value to check.
 * @returns True if the value conforms to the DatacoreLink interface.
 */
export function isDatacoreLink(v: unknown): v is DatacoreLink {
    return isRecord(v) && typeof v['path'] === 'string';
}

/**
 * Defensive unwrap for internal Obsidian plugins.
 * Extract the instance from wrapper objects often used in internal APIs.
 *
 * @param raw - The raw plugin-related object.
 * @returns The unwrapped instance or the original object.
 */
export function unwrapInternalPluginInstance(raw: unknown): unknown {
    if (!isRecord(raw)) return null;
    return raw['instance'] ?? raw;
}

/**
 * Recursively searches a bookmark tree for a specific file path.
 * Used to detect if a file is explicitly bookmarked in Obsidian's bookmarks plugin.
 *
 * @param items - The array of bookmark items (folders, groups, or files).
 * @param targetPath - The absolute path to search for.
 * @returns True if the path is found within the tree, false otherwise.
 */
export function isPathBookmarked(items: unknown[], targetPath: string): boolean {
    for (const item of items) {
        if (!isRecord(item)) continue;
        if (item['type'] === 'file' && typeof item['path'] === 'string' && item['path'] === targetPath) {
            return true;
        }
        const subItems = item['items'];
        if ((item['type'] === 'group' || item['type'] === 'folder') && Array.isArray(subItems)) {
            if (isPathBookmarked(subItems, targetPath)) return true;
        }
    }
    return false;
}
