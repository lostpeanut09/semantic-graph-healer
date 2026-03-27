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
        } else if (level === 'warn') {
            console.warn(prefix, message, ...args);
        } else if (level === 'debug') {
            console.debug(prefix, message, ...args);
        } else {
            // Obsidian recommends warn/error for general visibility in dev console for info messages
            console.warn(prefix, message, ...args);
        }
    }
}

/**
 * Type Guard for internal Obsidian App extensions.
 */
export function isObsidianInternalApp(app: App): app is App & ObsidianInternalApp {
    const internal = app as unknown as ObsidianInternalApp;
    return !!(internal && internal.plugins && typeof internal.plugins.getPlugin === 'function');
}

/**
 * SOTA ID Generator (RFC 4122 UUID).
 */
export function generateId(prefix: string): string {
    return `${prefix}_${crypto.randomUUID()}`;
}

/**
 * Universal Link Extractor for Dataview (Handles Proxy Arrays).
 */
/**
 * Extracts a single link name from a value.
 * Handles: Link objects, raw wikilink strings, plain names.
 */
function processSingleLink(v: unknown): string[] {
    // 1. Handle Link objects (Dataview/Datacore)
    if (v && typeof v === 'object' && 'path' in v) {
        const link = v as { display?: string; path: string };
        const name = link.display || link.path.split('/').pop()?.replace(/\.md$/, '') || '';
        return name ? [name] : [];
    }

    // 2. Handle strings (raw YAML values)
    const str = String(v).trim();
    if (!str || str === '?') return [];

    // 3. FIX: Check if string contains multiple [[wikilinks]]
    // We use a global regex to find ALL occurrences
    const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
    const matches: string[] = [];
    let match;
    while ((match = wikiLinkRegex.exec(str)) !== null) {
        // Extract target, handle aliases [[Note|Alias]]
        const linkTarget = match[1].split('|')[0].trim();
        if (linkTarget) {
            // Clean paths (remove .md if present)
            const cleanTarget = linkTarget.split('/').pop()?.replace(/\.md$/, '') || linkTarget;
            matches.push(cleanTarget);
        }
    }

    // If we found wikilinks, return them
    if (matches.length > 0) return matches;

    // 4. Fallback: treat as plain text if no wikilinks found
    // (Only if it's not a comma-separated list of things that aren't links)
    const cleaned = str.replace(/[[]]/g, '').trim();
    return cleaned ? [cleaned] : [];
}

/**
 * Universal Link Extractor for Dataview/Datacore.
 * Handles: Link objects, Proxy arrays, raw strings, comma-separated wikilinks.
 *
 * FIX: Now correctly extracts multiple links from:
 *   - YAML arrays: next: [[[A]], [[B]]]
 *   - Comma strings: next: "[[A]], [[B]]"
 *   - Dataview DataArrays (Proxy objects with forEach)
 */
export function extractLinks(page: Record<string, unknown>, keys: string[]): string[] {
    const results: string[] = [];

    keys.forEach((key) => {
        const value = page[key];
        if (value == null) return; // null or undefined

        // Check if iterable (Array, DataArray proxy, or any array-like)
        const isIterable =
            Array.isArray(value) ||
            (value && typeof value === 'object' && typeof (value as Record<string, unknown>).forEach === 'function');

        if (isIterable) {
            (value as { forEach: (cb: (v: unknown) => void) => void }).forEach((val: unknown) => {
                results.push(...processSingleLink(val));
            });
        } else {
            results.push(...processSingleLink(value));
        }
    });

    return [...new Set(results)];
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
    const depthScore = Math.min(folderDepth * 10, 100);
    const combined = vectorSim * 0.6 + depthScore * 0.4;
    return Math.round(Math.min(combined, 100));
}

/**
 * Sleep helper for UI thread yielding.
 */
export function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
}
