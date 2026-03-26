import { App } from 'obsidian';
import { ObsidianInternalApp } from '../types';

/**
 * HealerLogger: Centralized logging for SOTA compliance.
 */
export class HealerLogger {
    static info(msg: string, ...args: unknown[]) {
        console.log(`[Healer][INFO] ${msg}`, ...args);
    }
    static warn(msg: string, ...args: unknown[]) {
        console.warn(`[Healer][WARN] ${msg}`, ...args);
    }
    static error(msg: string, ...args: unknown[]) {
        console.error(`[Healer][ERROR] ${msg}`, ...args);
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
export function extractLinks(page: Record<string, unknown>, keys: string[]): string[] {
    const results: string[] = [];

    keys.forEach((key) => {
        const value = page[key];
        if (!value) return;

        const processSingle = (v: unknown): string => {
            if (v && typeof v === 'object' && 'path' in v) {
                const link = v as { display?: string; path: string };
                return link.display || link.path.split('/').pop()?.replace(/\.md$/, '') || '';
            }
            return String(v).replace(/[[\]]/g, '').trim();
        };

        if (Array.isArray(value) || (value && typeof (value as { forEach?: unknown }).forEach === 'function')) {
            (value as { forEach: (cb: (v: unknown) => void) => void }).forEach((val: unknown) => {
                const name = processSingle(val);
                if (name && name !== '?') results.push(name);
            });
        } else {
            const name = processSingle(value);
            if (name && name !== '?') results.push(name);
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
