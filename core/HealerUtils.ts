import { App } from 'obsidian';
import { ObsidianInternalApp } from '../types';

/**
 * HealerLogger: Centralized logging for SOTA compliance.
 */
export class HealerLogger {
    public static info(message: string, ...args: unknown[]) {
        HealerLogger.log('info', message, ...args);
    }

    public static warn(message: string, ...args: unknown[]) {
        HealerLogger.log('warn', message, ...args);
    }

    public static error(message: string, ...args: unknown[]) {
        HealerLogger.log('error', message, ...args);
    }

    public static debug(message: string, ...args: unknown[]) {
        HealerLogger.log('debug', message, ...args);
    }

    private static log(level: 'info' | 'warn' | 'error' | 'debug', message: string, ...args: unknown[]) {
        const prefix = `[SemanticHealer][${level.toUpperCase()}]`;
        if (level === 'error') {
            console.error(prefix, message, ...args);
        } else if (level === 'warn' || level === 'info') {
            // Obsidian community recommends warn for general visibility in dev console
            console.warn(prefix, message, ...args);
        } else if (level === 'debug') {
            console.debug(prefix, message, ...args);
        }
    }
}

/**
 * Type Guard for internal Obsidian App extensions.
 */
export function isObsidianInternalApp(app: App): app is App & ObsidianInternalApp {
    const internal = app as unknown as ObsidianInternalApp;
    return !!(
        internal &&
        internal.plugins &&
        typeof internal.plugins.getPlugin === 'function' &&
        'enabledPlugins' in internal.plugins
    );
}

/**
 * UUID Fallback for non-secure contexts (MDN Compliance).
 */
function uuidFallbackV4(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
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
 * Normalizes a raw string or path to a clean note basename.
 * Handles: wikilinks, subpaths (#), aliases (|), quotes, extensions.
 */
function normalizeTargetToBasename(raw: string): string {
    // 1. trim + remove external quotes (Obsidian Properties standard)
    const s = raw.trim().replace(/^["']|["']$/g, '');

    // 2. remove alias: [[Note|Alias]] => Note
    const noAlias = s.split('|')[0].trim();

    // 3. remove subpath: [[Note#Heading]] / [[Note#^block]] => Note
    const noSubpath = noAlias.split('#')[0].trim();

    // 4. keep only basename + remove extension
    const base = (noSubpath.split('/').pop() ?? '').replace(/\.md$/i, '').trim();

    return base;
}

/**
 * Universal Link Extractor for Dataview (Handles Proxy Arrays).
 */
function processSingleLink(v: unknown): string[] {
    if (v == null) return [];

    // Flatten: handle nested arrays from complex templates or YAML
    if (Array.isArray(v)) return v.flatMap(processSingleLink);

    // Dataview/Datacore link object: extract target path, ignoring display alias
    if (isDvLinkLike(v)) {
        const base = normalizeTargetToBasename(v.path);
        return base ? [base] : [];
    }

    // Only process strings to avoid [object Object] contamination
    if (typeof v !== 'string') return [];

    const str = v.trim();
    if (!str || str === '?') return [];

    // Extract ALL wikilinks from the string (including quoted ones in Properties)
    const wikiLinkRegex = /!?\[\[([^\]]+)\]\]/g;
    const out: string[] = [];

    let match: RegExpExecArray | null;
    while ((match = wikiLinkRegex.exec(str)) !== null) {
        const base = normalizeTargetToBasename(match[1]);
        if (base) out.push(base);
    }
    if (out.length > 0) return out;

    // Fallback: treat as plain text name if no wikilinks found, but clean up brackets
    const cleaned = normalizeTargetToBasename(str.replace(/[[]]/g, ''));
    return cleaned ? [cleaned] : [];
}

/**
 * Universal Link Extractor for Dataview/Datacore.
 * Handles: Link objects, Proxy arrays, raw strings, comma-separated wikilinks.
 */
export function extractLinks(page: Record<string, unknown>, keys: string[]): string[] {
    const seen = new Set<string>();

    keys.forEach((key) => {
        const value = page[key];
        if (value == null) return;

        // Support both standard Arrays and Dataview DataArray proxies
        const isIterable =
            Array.isArray(value) ||
            (value && typeof value === 'object' && typeof (value as Record<string, unknown>).forEach === 'function');

        if (isIterable) {
            (value as { forEach: (cb: (v: unknown) => void) => void }).forEach((val: unknown) => {
                processSingleLink(val).forEach((name) => seen.add(name));
            });
        } else {
            processSingleLink(value).forEach((name) => seen.add(name));
        }
    });

    return [...seen];
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
    return `[GRAPH RAG: SEMANTIC PROXIMITY]\nFocus Node: [[${basename}]]\nTags: ${tags}\nProperties Count: ${propertiesCount}\n\nSnippet:\n${contentSnippet}...\n\nTASK: Identify 3 distinct concepts or non-existing MOCs that should be linked to this node to enhance the semantic graph topology. Output as a bulleted list of Obsidian links [[Link]].`;
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

    return `
You are the Supreme Tribunal of the Knowledge Graph.
An incongruence has been detected in the vault. 

Note: [[${noteName}]]
Property: '${property}'
Competing values: ${values.join(', ')}

${infraContext}
${candidateContext}

CONTENT SNIPPET:
${contentSnippet}

TASK: Based on the content and topological context, decide which value(s) should be kept.
Output format:
WINNER: [[Note Name]] | SCORE: % | WHY: reason
RUNNERUP: [[Note Name]] | SCORE: % | WHY: reason
`;
}

/**
 * Calculates Harmonized Topological Ranking (HTR-2026).
 * Formula: (0.6 * VectorSim + 0.4 * TopologyDepth)
 */
export function calculateHtrScore(vectorSim: number, folderDepth: number): number {
    // Explicit normalization for scale safety
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
