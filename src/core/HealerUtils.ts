import { App, TFile, parseLinktext } from 'obsidian';
import { maskSecrets } from './utils/RedactUtils';
import type { ObsidianInternalApp } from '../types';

export type ApiKeyType = 'openai' | 'anthropic' | 'deepseek' | 'infranodus' | 'custom';

/**
 * HealerLogger: Centralized logging for SOTA compliance.
 * Redesigned for Phase 1 as a bridge to the instance-based logger.
 */
interface HealerLoggerInstance {
    /** Logs informational messages. */
    info(message: string, ...args: unknown[]): void;
    /** Logs warning messages. */
    warn(message: string, ...args: unknown[]): void;
    /** Logs error messages. */
    error(message: string, ...args: unknown[]): void;
    /** Logs debug messages. */
    debug(message: string, ...args: unknown[]): void;
}

/**
 * HealerLogger: Centralized logging bridge for the plugin.
 */
export class HealerLogger {
    private static instance: HealerLoggerInstance | null = null;

    /**
     * Sets the global logger instance.
     * @param instance - The logger instance to use.
     */
    public static setInstance(instance: HealerLoggerInstance) {
        HealerLogger.instance = instance;
    }

    /**
     * Logs an info message.
     * @param message - The message to log.
     * @param args - Additional arguments.
     */
    public static info(message: string, ...args: unknown[]) {
        if (HealerLogger.instance) {
            HealerLogger.instance.info(message, ...args);
        } else {
            console.info(`[SemanticHealer][INFO] ${message}`, ...args);
        }
    }

    /**
     * Logs a warning message.
     * @param message - The message to log.
     * @param args - Additional arguments.
     */
    public static warn(message: string, ...args: unknown[]) {
        if (HealerLogger.instance) {
            HealerLogger.instance.warn(message, ...args);
        } else {
            console.warn(`[SemanticHealer][WARN] ${message}`, ...args);
        }
    }

    /**
     * Logs an error message.
     * @param message - The message to log.
     * @param args - Additional arguments.
     */
    public static error(message: string, ...args: unknown[]) {
        if (HealerLogger.instance) {
            HealerLogger.instance.error(message, ...args);
        } else {
            console.error(`[SemanticHealer][ERROR] ${message}`, ...args);
        }
    }

    /**
     * Logs a debug message.
     * @param message - The message to log.
     * @param args - Additional arguments.
     */
    public static debug(message: string, ...args: unknown[]) {
        if (HealerLogger.instance) {
            HealerLogger.instance.debug(message, ...args);
        } else {
            console.debug(`[SemanticHealer][DEBUG] ${message}`, ...args);
        }
    }
}

/**
 * Detects LLM provider from endpoint URL.
 * @param endpoint - The API endpoint URL.
 * @returns The detected provider type.
 */
export function getProviderFromEndpoint(endpoint: string): ApiKeyType {
    const ep = (endpoint || '').toLowerCase();
    if (ep.includes('anthropic.com')) return 'anthropic';
    if (ep.includes('openai.com')) return 'openai';
    if (ep.includes('deepseek')) return 'deepseek';
    return 'custom';
}

/**
 * Type Guard for internal Obsidian App extensions.
 * @param app - The Obsidian App instance.
 * @returns True if the app has internal plugin management extensions.
 */
export function isObsidianInternalApp(app: App): app is App & ObsidianInternalApp {
    const internal = app as unknown as ObsidianInternalApp;
    return !!(
        internal.plugins &&
        typeof internal.plugins.enabledPlugins !== 'undefined' &&
        typeof internal.plugins.getPlugin === 'function'
    );
}

/**
 * UUID Fallback for non-secure contexts (MDN Compliance).
 * @returns A randomly generated v4 UUID string.
 */
function uuidFallbackV4(): string {
    const c = globalThis.crypto;
    if (!c?.getRandomValues) {
        HealerLogger.warn(
            'Secure Crypto.getRandomValues not available. Using non-cryptographic Math.random fallback for ID generation.',
        );
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
            const r = (Math.random() * 16) | 0;
            const v = ch === 'x' ? r : (r & 0x3) | 0x8;
            return v.toString(16);
        });
    }
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // v4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * SOTA ID Generator (RFC 4122 UUID) with fallback.
 * @param prefix - A string prefix to prepend to the generated ID.
 * @returns A unique identifier string.
 */
export function generateId(prefix: string): string {
    const cryptoObj = globalThis.crypto as unknown as {
        randomUUID?: () => string;
    };
    const uuid = cryptoObj?.randomUUID?.() || uuidFallbackV4();
    return `${prefix}_${uuid}`;
}

/**
 * Normalizes a vault path string to its absolute, resolved form.
 * Follows Obsidian best practice (parseLinktext + vault + metadataCache).
 * @param app - The Obsidian App instance.
 * @param path - The raw path or linktext.
 * @param sourcePath - The path of the file containing the link (for relative resolution).
 * @returns The normalized absolute vault path.
 */
export function normalizeVaultPath(app: App, path: string, sourcePath = ''): string {
    const { path: linkpath } = parseLinktext(path);
    const file = app.vault.getAbstractFileByPath(linkpath);
    if (file instanceof TFile) return file.path;
    const resolved = app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
    return resolved?.path ?? linkpath;
}

/**
 * Universal Link Processing Logic (v2026.3)
 */
type DVLinkLike = {
    path: string;
    display?: string;
    subpath?: string;
    type?: string;
    embed?: boolean;
};

/**
 * Type guard for Dataview-style link objects.
 * @param v - The value to check.
 * @returns True if the value is a DVLinkLike object.
 */
function isDvLinkLike(v: unknown): v is DVLinkLike {
    const candidate = v as DVLinkLike;
    return !!candidate && typeof candidate === 'object' && typeof candidate.path === 'string';
}

/**
 * Normalize any "target-ish" string into an Obsidian linkpath.
 * @param raw - The raw string to normalize.
 * @returns The cleaned linkpath.
 */
export function normalizeToLinkpath(raw: string): string {
    const s0 = raw.trim().replace(/^["']|["']$/g, '');
    const noAlias = s0.split('|')[0].trim();
    const noSubpath = noAlias.split('#')[0].trim();
    const stripped = noSubpath.replace(/^\[\[|\]\]$/g, '').trim();
    const noExt = stripped.replace(/\.md$/i, '').trim();
    try {
        return decodeURIComponent(noExt);
    } catch {
        return noExt;
    }
}

/**
 * Extract linkpaths from a single value.
 * @param v - The value to extract links from.
 * @returns An array of normalized linkpaths.
 */
function extractLinkpathsFromValue(v: unknown): string[] {
    if (v == null) return [];
    if (Array.isArray(v)) return v.flatMap(extractLinkpathsFromValue);
    if (isDvLinkLike(v)) {
        const lp = normalizeToLinkpath(v.path);
        return lp ? [lp] : [];
    }
    if (typeof v !== 'string') return [];

    const str = v.trim();
    if (!str || str === '?') return [];

    const out: string[] = [];

    // 1) Wikilinks / embeds: [[...]] or ![[...]]
    const wikiRe = /!?\[\[([^\]]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = wikiRe.exec(str)) !== null) {
        const lp = normalizeToLinkpath(m[1]);
        if (lp) out.push(lp);
    }

    // 2) Markdown links: [text](link) - Only if internal (no scheme)
    const mdRe = /\[[^\]]*\]\(([^)]+)\)/g;
    while ((m = mdRe.exec(str)) !== null) {
        const targetRaw = m[1].trim();
        const target = targetRaw.replace(/\s+["'][^"']*["']\s*$/, '').trim();
        const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target);
        if (!hasScheme) {
            const lp = normalizeToLinkpath(target);
            if (lp) out.push(lp);
        }
    }

    if (out.length) return out;

    // 3) Fallback: plain text
    const cleaned = str.replace(/\[/g, '').replace(/\]/g, '').trim();
    const parts = cleaned.includes(',')
        ? cleaned
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
        : [cleaned];

    for (const p of parts) {
        const lp = normalizeToLinkpath(p);
        if (lp) out.push(lp);
    }

    return out;
}

/**
 * Universal Linkpath Extractor for Dataview/Datacore.
 * @param page - The page metadata record.
 * @param keys - The keys to extract links from.
 * @returns An array of unique normalized linkpaths.
 */
export function extractLinkpaths(page: Record<string, unknown>, keys: string[]): string[] {
    const seen = new Set<string>();
    keys.forEach((key) => {
        const value = page[key];
        if (value == null) return;

        const isIterable =
            Array.isArray(value) ||
            (value && typeof value === 'object' && typeof (value as Record<string, unknown>).forEach === 'function');

        if (isIterable) {
            (value as { forEach: (cb: (v: unknown) => void) => void }).forEach((val: unknown) => {
                extractLinkpathsFromValue(val).forEach((lp) => seen.add(lp));
            });
        } else {
            extractLinkpathsFromValue(value).forEach((lp) => seen.add(lp));
        }
    });
    return [...seen];
}

/**
 * Resolve linkpaths to canonical TFile.path values.
 * @param app - The Obsidian App instance.
 * @param linkpaths - Array of linkpaths to resolve.
 * @param sourcePath - The file path where the links originate.
 * @param cache - Optional cache for resolution results.
 * @returns Array of unique resolved TFile paths.
 */
export function resolveLinkpathsToPaths(
    app: App,
    linkpaths: string[],
    sourcePath: string,
    cache?: Map<string, string | null>,
): string[] {
    const seen = new Set<string>();
    for (const lp of linkpaths) {
        const key = `${sourcePath}::${lp}`;
        if (cache && cache.has(key)) {
            const cached = cache.get(key);
            if (cached) seen.add(cached);
            continue;
        }
        const file = app.metadataCache.getFirstLinkpathDest(lp, sourcePath);
        const resolved = file?.path ?? null;
        if (cache) cache.set(key, resolved);
        if (resolved) seen.add(resolved);
    }
    return [...seen];
}

/**
 * Extracts and resolves linkpaths from a page object.
 * @param app - The Obsidian App instance.
 * @param page - The page metadata record.
 * @param keys - The keys to extract links from.
 * @param sourcePath - The file path where the links originate.
 * @param cache - Optional cache for resolution results.
 * @returns Array of unique resolved TFile paths.
 */
export function extractResolvedPaths(
    app: App,
    page: Record<string, unknown>,
    keys: string[],
    sourcePath: string,
    cache?: Map<string, string | null>,
): string[] {
    const linkpaths = extractLinkpaths(page, keys);
    return resolveLinkpathsToPaths(app, linkpaths, sourcePath, cache);
}

/**
 * Converts a TFile path to a Wikilink string.
 * @param app - The Obsidian App instance.
 * @param targetPath - The destination file path.
 * @param sourcePath - The originating file path.
 * @returns A formatted Wikilink string.
 */
export function pathToWikilink(app: App, targetPath: string, sourcePath: string): string {
    const af = app.vault.getAbstractFileByPath(targetPath);
    if (af instanceof TFile) {
        const linktext = app.metadataCache.fileToLinktext(af, sourcePath, true);
        return `[[${linktext}]]`;
    }
    return `[[${targetPath}]]`;
}

/**
 * RESOLVE SUGGESTION -> TFILE
 * @param app - The Obsidian App instance.
 * @param suggestion - The suggestion object containing link and optional meta.
 * @returns The resolved TFile or null if not found.
 */
export function resolveTargetFile(
    app: App,
    suggestion: {
        link: string;
        meta?: { targetPath?: string; sourcePath?: string };
    },
): TFile | null {
    if (suggestion.meta?.targetPath) {
        const f = app.vault.getAbstractFileByPath(suggestion.meta.targetPath);
        if (f instanceof TFile) return f;
    }
    const linkpath = normalizeToLinkpath(suggestion.link);
    return app.metadataCache.getFirstLinkpathDest(linkpath, suggestion.meta?.sourcePath || '');
}

/**
 * Prompt Template: Graph RAG Semantic Proximity.
 * @param basename - The file basename.
 * @param tags - Comma-separated tags.
 * @param propertiesCount - Number of properties in the file.
 * @param contentSnippet - Snippet of the file content.
 * @returns The formatted prompt string.
 */
export function formatRagPrompt(
    basename: string,
    tags: string,
    propertiesCount: number,
    contentSnippet: string,
): string {
    const safeSnippet = maskSecrets(contentSnippet);
    return `[GRAPH RAG: SEMANTIC PROXIMITY]\nFocus Node: [[${basename}]]\nTags: ${tags}\nProperties Count: ${propertiesCount}\n\nSnippet:\n${safeSnippet}...\n\nTASK: Identify 3 distinct concepts or non-existing MOCs that should be linked to this node to enhance the semantic graph topology. Output as a bulleted list of Obsidian links [[Link]].`;
}

/**
 * Prompt Template: Incongruence Resolution.
 * @param noteName - The name of the note.
 * @param property - The property name.
 * @param values - Array of competing values.
 * @param contentSnippet - Snippet of the file content.
 * @param candidateData - Optional metadata for candidate values.
 * @param isInfraNodus - True if the conflict was identified by InfraNodus.
 * @returns The formatted prompt string.
 */
export function formatIncongruencePrompt(
    noteName: string,
    property: string,
    values: string[],
    contentSnippet: string,
    candidateData: Record<string, unknown> = {},
    isInfraNodus: boolean = false,
): string {
    const infraContext = isInfraNodus
        ? '\n[INFRANODUS INSIGHT]\nThis conflict was identified as a structural gap by the InfraNodus network science engine. It suggests a missing bridge between clusters.\n'
        : '';

    let candidateContext = '\n[CANDIDATE METADATA]\n';
    for (const [val, data] of Object.entries(candidateData)) {
        const d = data as { folder?: string; score?: number };
        candidateContext += `- ${val}: Folder=${d.folder || 'unknown'}, HTR_Score=${d.score || 0}%\n`;
    }

    const safeSnippet = maskSecrets(contentSnippet);

    return `
You are the Supreme Tribunal of the Knowledge Graph.
An incongruence has been detected in the vault. 

Note: [[${noteName}]]
Property: '${property}'
Competing values: ${values.join(', ')}

${infraContext}
${candidateContext}

CONTENT SNIPPET:
${safeSnippet}

TASK: Based on the content and topological context, decide which value(s) should be kept.
Output format:
WINNER: [[Note Name]] | SCORE: % | WHY: reason
RUNNERUP: [[Note Name]] | SCORE: % | WHY: reason
`;
}

/**
 * Calculates cosine similarity between two vectors.
 * @param v1 - The first vector.
 * @param v2 - The second vector.
 * @returns The similarity score (0-1).
 */
export function cosineSimilarity(v1: number[], v2: number[]): number {
    if (!v1 || !v2 || v1.length === 0 || v1.length !== v2.length) return 0;
    let dot = 0;
    let norm1 = 0;
    let norm2 = 0;
    for (let i = 0; i < v1.length; i++) {
        dot += v1[i] * v2[i];
        norm1 += v1[i] * v1[i];
        norm2 += v2[i] * v2[i];
    }
    const mag = Math.sqrt(norm1) * Math.sqrt(norm2);
    return mag === 0 ? 0 : dot / mag;
}

/**
 * Calculates Harmonized Topological Ranking (HTR-2026).
 * @param vectorSim - The vector similarity score.
 * @param folderDepth - The folder depth difference.
 * @returns The HTR score (0-100).
 */
export function calculateHtrScore(vectorSim: number, folderDepth: number): number {
    const vs = vectorSim <= 1 ? vectorSim * 100 : vectorSim;
    const depthScore = Math.min(Math.max(folderDepth, 0) * 10, 100);
    const combined = vs * 0.6 + depthScore * 0.4;
    return Math.round(Math.min(Math.max(combined, 0), 100));
}

/**
 * Sleep helper for UI thread yielding.
 * @param ms - Milliseconds to sleep.
 * @returns A promise that resolves after the timeout.
 */
export function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

// ============================================================================
// ✅ NEW UTILITY FUNCTIONS (SOTA 2026)
// ============================================================================

/**
 * ✅ NEW: Safe regex compilation with error handling.

 * @param pattern - The regex pattern string.
 * @param flags - Optional regex flags.
 * @returns A RegExp object or null if compilation fails.
 */
export function safeCompileRegex(pattern: string, flags?: string): RegExp | null {
    try {
        if (!pattern) return null;
        return new RegExp(pattern, flags);
    } catch (e) {
        HealerLogger.error(`Invalid regex pattern: "${pattern}"`, e);
        return null;
    }
}

/**
 * ✅ NEW: Type guard for Promises / Thenables.
 * @param val - The value to check.
 * @returns True if the value is thenable.
 */
export function isThenable<T>(val: unknown): val is Promise<T> {
    return (
        val !== null &&
        (typeof val === 'object' || typeof val === 'function') &&
        typeof (val as Record<string, unknown>).then === 'function'
    );
}

/**
 * ✅ NEW: Safe stringification for template literals.
 * @param val - The value to stringify.
 * @returns A string representation of the value.
 */
export function safeString(val: unknown): string {
    if (val === null || val === undefined) return 'none';
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (typeof val === 'object' && 'path' in (val as Record<string, unknown>)) {
        return (val as { path: string }).path;
    }
    return JSON.stringify(val);
}
