import { App, TFile } from 'obsidian';
import { ObsidianInternalApp } from '../types';

/**
 * HealerLogger: Centralized logging for SOTA compliance.
 * Redesigned for Phase 1 as a bridge to the instance-based logger.
 */
interface HealerLoggerInstance {
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
}

export class HealerLogger {
    private static instance: HealerLoggerInstance | null = null;

    public static setInstance(instance: HealerLoggerInstance) {
        HealerLogger.instance = instance;
    }

    public static info(message: string, ...args: unknown[]) {
        if (HealerLogger.instance) {
            HealerLogger.instance.info(message, ...args);
        } else {
            console.debug(`[SemanticHealer][INFO] ${message}`, ...args);
        }
    }

    public static warn(message: string, ...args: unknown[]) {
        if (HealerLogger.instance) {
            HealerLogger.instance.warn(message, ...args);
        } else {
            console.warn(`[SemanticHealer][WARN] ${message}`, ...args);
        }
    }

    public static error(message: string, ...args: unknown[]) {
        if (HealerLogger.instance) {
            HealerLogger.instance.error(message, ...args);
        } else {
            console.error(`[SemanticHealer][ERROR] ${message}`, ...args);
        }
    }

    public static debug(message: string, ...args: unknown[]) {
        if (HealerLogger.instance) {
            HealerLogger.instance.debug(message, ...args);
        } else {
            console.debug(`[SemanticHealer][DEBUG] ${message}`, ...args);
        }
    }
}

/**
 * Type Guard for internal Obsidian App extensions.
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
 */
export function generateId(prefix: string): string {
    const cryptoObj = globalThis.crypto as unknown as { randomUUID?: () => string };
    const uuid = cryptoObj?.randomUUID?.() || uuidFallbackV4();
    return `${prefix}_${uuid}`;
}

/**
 * Universal Link Processing Logic (v2026.3)
 */
type DVLinkLike = { path: string; display?: string; subpath?: string; type?: string; embed?: boolean };

function isDvLinkLike(v: unknown): v is DVLinkLike {
    const candidate = v as DVLinkLike;
    return !!candidate && typeof candidate === 'object' && typeof candidate.path === 'string';
}

/**
 * Normalize any "target-ish" string into an Obsidian linkpath.
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
 */
export function resolveTargetFile(
    app: App,
    suggestion: { link: string; meta?: { targetPath?: string; sourcePath?: string } },
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
 */
export function formatRagPrompt(
    basename: string,
    tags: string,
    propertiesCount: number,
    contentSnippet: string,
): string {
    const safeSnippet = sanitizeForLlm(contentSnippet);
    return `[GRAPH RAG: SEMANTIC PROXIMITY]\nFocus Node: [[${basename}]]\nTags: ${tags}\nProperties Count: ${propertiesCount}\n\nSnippet:\n${safeSnippet}...\n\nTASK: Identify 3 distinct concepts or non-existing MOCs that should be linked to this node to enhance the semantic graph topology. Output as a bulleted list of Obsidian links [[Link]].`;
}

/**
 * Prompt Template: Incongruence Resolution.
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

    const safeSnippet = sanitizeForLlm(contentSnippet);

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
 * Calculates Harmonized Topological Ranking (HTR-2026).
 */
export function calculateHtrScore(vectorSim: number, folderDepth: number): number {
    const vs = vectorSim <= 1 ? vectorSim * 100 : vectorSim;
    const depthScore = Math.min(Math.max(folderDepth, 0) * 10, 100);
    const combined = vs * 0.6 + depthScore * 0.4;
    return Math.round(Math.min(Math.max(combined, 0), 100));
}

/**
 * Sleep helper for UI thread yielding.
 */
export function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}

// ============================================================================
// ✅ NEW UTILITY FUNCTIONS (SOTA 2026)
// ============================================================================

/**
 * ✅ NEW: SOTA 2026 Redaction Utility.
 * Masks sensitive patterns (Bearer, JWT) in strings before sending to external APIs.
 */
export function sanitizeForLlm(s: string): string {
    if (!s) return '';
    // Mask Bearer tokens: Bearer <token>
    let masked = s.replace(/\bBearer\s+[A-Za-z0-9._~-]{10,}(?:\.[A-Za-z0-9._~-]+){0,2}\b/gi, 'Bearer ***');

    // Mask JWT-like structures (starts with eyJ... contains dots, minimum length)
    masked = masked.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '***JWT***');

    return masked;
}

/**
 * ✅ NEW: Safe regex compilation with error handling.
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
