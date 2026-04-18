import { requestUrl, RequestUrlParam } from 'obsidian';
import { SemanticGraphHealerSettings, ReasoningResult } from '../types';
import { HealerLogger } from './HealerUtils';

/**
 * Custom Error for LLM operations.
 */
class LlmError extends Error {
    constructor(
        public readonly model: string,
        public readonly status: number,
        message: string,
    ) {
        super(`LLM [${model}] failed: ${status} - ${message}`);
    }
}

interface LlmResponse {
    choices?: Array<{
        message?: {
            content?: string;
        };
    }>;
    output?: unknown[];
    message?: {
        content?: string;
    };
    response?: string;
    data?: unknown;
    models?: unknown;
}

/**
 * LlmService: Orchestrates AI operations and model detection.
 * SOTA 2026 Modular Architecture.
 */
export class LlmService {
    private verificationCache = new Map<string, { result: unknown; timestamp: number }>();
    private readonly CACHE_TTL = 300000; // 5 minutes
    private cacheCleanupInterval: ReturnType<typeof setInterval>;

    constructor(
        private settings: SemanticGraphHealerSettings,
        private getKey: (type: 'openai' | 'anthropic' | 'deepseek' | 'infranodus' | 'custom') => Promise<string>,
    ) {
        // Run cleanup periodically
        this.cacheCleanupInterval = setInterval(() => this.cleanupCache(), 600000);
    }

    public destroy(): void {
        if (this.cacheCleanupInterval) {
            clearInterval(this.cacheCleanupInterval);
        }
    }

    private cleanupCache(): void {
        const now = Date.now();
        for (const [key, value] of this.verificationCache.entries()) {
            if (now - value.timestamp > this.CACHE_TTL) {
                this.verificationCache.delete(key);
            }
        }
    }

    /**
     * Executes an AI query against the configured provider.
     */
    public async callLlm(prompt: string, useTribunal: boolean = false, signal?: AbortSignal): Promise<string> {
        if (signal?.aborted) throw new Error('AbortError');
        HealerLogger.info(`AI Call initiated for model: ${this.settings.llmModelName}`);

        const queryModel = async (
            endpoint: string,
            apiKey: string,
            model: string,
            timeoutSec: number,
            retryCount: number = 0,
        ): Promise<string> => {
            const timeoutMs = (timeoutSec || 30) * 1000;
            const MAX_RETRIES = this.settings.llmMaxRetries || 2;
            const RETRYABLE_STATUSES = this.settings.llmRetryableStatuses || [429, 408, 503];

            const cleanEp = endpoint.replace(/\/+$/, '');
            const isResponsesApi = cleanEp.endsWith('/v1/responses');
            const apiPath = isResponsesApi ? 'responses' : ('chat/completions' as const);

            const makeRequest = async (): Promise<{ status: number; json: LlmResponse }> => {
                const bodyJson = {
                    model: model,
                    max_tokens: this.settings.aiMaxTokens || 1000,
                    temperature: this.settings.aiTemperature ?? 0.7,
                } as Record<string, unknown>;

                const normalizeEndpoint = (ep: string, tgtPath: 'responses' | 'chat/completions') => {
                    const base = ep.replace(/\/+$/, ''); // trim trailing /
                    if (base.endsWith(`/v1/${tgtPath}`)) return base;
                    if (base.endsWith('/v1')) return `${base}/${tgtPath}`;
                    if (tgtPath === 'responses' && base.endsWith('/v1/responses')) return base;
                    if (tgtPath === 'chat/completions' && base.endsWith('/v1/chat/completions')) return base;
                    return `${base}/${tgtPath}`;
                };

                if (isResponsesApi) {
                    bodyJson['instructions'] = 'You are the Supreme Tribunal of the Knowledge Graph.';
                    bodyJson['input'] = prompt;
                    bodyJson['max_output_tokens'] = this.settings.aiMaxTokens || 1000;
                    delete bodyJson['max_tokens'];
                } else {
                    bodyJson['messages'] = [{ role: 'user', content: prompt }];
                }

                /**
                 * ✅ NEW: SOTA 2026 Type Extension.
                 * Extends native RequestUrlParam to include the 'timeout' property (Obsidian v1.11.8+).
                 * Resolves TS2353 build errors for environments with lagging type definitions.
                 */
                interface HealerRequestUrlParam extends RequestUrlParam {
                    timeout?: number;
                }

                const fetchPromise = requestUrl({
                    url: normalizeEndpoint(endpoint, apiPath),
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'SemanticGraphHealer/2026.3',
                    },
                    body: JSON.stringify(bodyJson),
                    throw: false,
                    timeout: timeoutMs,
                } as HealerRequestUrlParam);

                const response = (await fetchPromise) as {
                    status: number;
                    json: LlmResponse;
                };
                if (signal?.aborted) throw new Error('AbortError');
                return response;
            };

            try {
                const response = await makeRequest();

                // ✅ UNIFIED RETRY LOGIC: Single point for all retry reasoning
                const shouldRetry =
                    (RETRYABLE_STATUSES.includes(response.status) || response.status >= 500) &&
                    retryCount < MAX_RETRIES;

                if (shouldRetry) {
                    const delay = Math.pow(2, retryCount) * 1000;
                    HealerLogger.warn(
                        `LLM [${model}] failed (${response.status}). Retry ${retryCount + 1}/${MAX_RETRIES} in ${delay}ms...`,
                    );
                    await new Promise((r) => setTimeout(r, delay));
                    return queryModel(endpoint, apiKey, model, timeoutSec, retryCount + 1);
                }

                if (response.status !== 200) {
                    throw new LlmError(model, response.status, 'Endpoint rejected request');
                }

                const json = response.json;

                // ✅ VALIDATION: Ensure response structure is valid
                if (!this.validateLlmResponse(json, isResponsesApi)) {
                    HealerLogger.warn(`Invalid LLM response structure: ${JSON.stringify(json).slice(0, 200)}`);
                    return '';
                }

                return (
                    (isResponsesApi ? this.extractResponsesText(json) : '') ||
                    json.choices?.[0]?.message?.content?.trim() ||
                    json.message?.content?.trim() ||
                    json.response?.trim() ||
                    ''
                );
            } catch (e) {
                // ✅ RETRY ON EXCEPTION (e.g. Timeout)
                if (retryCount < MAX_RETRIES) {
                    const delay = Math.pow(2, retryCount) * 1000;
                    HealerLogger.warn(
                        `LLM [${model}] exception. Retry ${retryCount + 1}/${MAX_RETRIES} in ${delay}ms...`,
                    );
                    await new Promise((r) => setTimeout(r, delay));
                    return queryModel(endpoint, apiKey, model, timeoutSec, retryCount + 1);
                }

                HealerLogger.error(`LLM error [${model}] (final attempt ${retryCount + 1}):`, e);
                return `Error: ${e instanceof Error ? e.message : 'Unknown communication failure'}`;
            }
        };

        const primaryApiKey = await this.getKey('openai');
        const result = await queryModel(
            this.settings.llmEndpoint,
            primaryApiKey,
            this.settings.llmModelName,
            this.settings.primaryTimeout,
        );

        if (!useTribunal || !this.settings.enableAiTribunal) return result;

        // TRIBUNAL LOGIC (SOTA 2026 Consensus Verification)
        const secondaryApiKey = await this.getKey('anthropic');
        let secondResult = '';
        let secondWinner = '';
        let consensusState = 'STABLE';

        try {
            secondResult = await queryModel(
                this.settings.secondaryLlmEndpoint,
                secondaryApiKey,
                this.settings.secondaryLlmModelName,
                this.settings.secondaryTimeout,
            );
            secondWinner = this.parseReasoningResult(secondResult).winner?.toLowerCase() || '';
        } catch (e) {
            HealerLogger.warn('AI Tribunal secondary model failed. Falling back to primary result.', e);
            return result; // Graceful fallback
        }

        const firstWinner = this.parseReasoningResult(result).winner?.toLowerCase();

        if (firstWinner && secondWinner && firstWinner !== secondWinner) {
            consensusState = 'CONFLICT';
        } else if (!firstWinner || !secondWinner) {
            consensusState = 'UNCERTAIN';
        }

        return `${result}\n\n<tribunal_audit>\nStatus: ${consensusState}\nSecondary Model Output: ${secondResult}\n</tribunal_audit>`;
    }

    /**
     * ✅ NEW: Phase 3 - Semantic Tag Propagation Validation (Binary YES/NO)
     */
    public async validateTagInheritance(
        childName: string,
        tag: string,
        parentName: string,
        childContent?: string,
        parentContent?: string,
    ): Promise<boolean> {
        if (!this.settings.llmEndpoint || !this.settings.llmModelName) return false;

        const cacheKey = `tag:${childName}:${tag}:${parentName}`;
        const cached = this.verificationCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            HealerLogger.debug(`Tag validation cache hit: ${cacheKey}`);
            return cached.result as boolean;
        }

        if (!childContent && !parentContent) {
            HealerLogger.warn(
                `Tag validation called without content context for ${childName} -> ${tag} (accuracy may be reduced)`,
            );
        }

        const prompt = `
[CONTEXT: Knowledge Graph Taxonomy Validation]

=== PARENT CONCEPT ===
Name: ${parentName}
Content Preview: ${parentContent?.substring(0, 500) || 'Not provided'}

=== CHILD CONCEPT ===
Name: ${childName}
Content Preview: ${childContent?.substring(0, 500) || 'Not provided'}

=== VALIDATION TASK ===
Tag to inherit: ${tag}
Question: Does "${childName}" logically belong to the taxonomy "${tag}" based on the content of the notes?

Respond ONLY with: YES or NO`.trim();

        try {
            const response = await this.callLlm(prompt, false);
            const isValid = response.toUpperCase().includes('YES');
            this.verificationCache.set(cacheKey, { result: isValid, timestamp: Date.now() });
            return isValid;
        } catch (e) {
            HealerLogger.error(`Tag validation failed for ${childName} -> ${tag}`, e);
            return false;
        }
    }

    /**
     * ✅ NEW: Phase 3 - Branch Sequence Validation (Binary VALID/CONTRADICTION)
     */
    public async validateBranching(
        sourceName: string,
        targetNames: string[],
        sourceContent?: string,
        targetContents?: string[],
        existingRelations?: string,
    ): Promise<boolean> {
        if (!this.settings.llmEndpoint || !this.settings.llmModelName) return false;

        const cacheKey = `branch:${sourceName}:${targetNames.join(',')}`;
        const cached = this.verificationCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            HealerLogger.debug(`Branch validation cache hit: ${cacheKey}`);
            return cached.result as boolean;
        }

        const prompt = `
[CONTEXT: Knowledge Graph Sequential Flow Validation]

=== SOURCE NOTE ===
Name: ${sourceName}
Content Preview: ${sourceContent?.substring(0, 500) || 'Not provided'}

=== POSSIBLE CONTINUATIONS ===
${targetNames
    .map(
        (name, i) => `
--- Target ${i + 1}: ${name} ---
Content Preview: ${targetContents?.[i]?.substring(0, 300) || 'Not provided'}
`,
    )
    .join('\n')}

=== EXISTING RELATIONSHIPS ===
${existingRelations || 'No existing relationships found'}

=== VALIDATION TASK ===
Question: Is it logically VALID for "${sourceName}" to have multiple sequential 
continuations (${targetNames.join(', ')}), or is this a CONTRADICTION that breaks 
temporal/narrative linearity?

Consider:
1. Do the target notes represent parallel topics or alternative paths?
2. Do they break chronological/narrative flow?
3. Is this a choose-your-own-adventure structure (valid) or an error?

Respond ONLY with: VALID or CONTRADICTION
`.trim();

        try {
            const response = await this.callLlm(prompt, false);
            const isValid =
                response.toUpperCase().includes('VALID') && !response.toUpperCase().includes('CONTRADICTION');
            this.verificationCache.set(cacheKey, { result: isValid, timestamp: Date.now() });
            return isValid;
        } catch (e) {
            HealerLogger.error(`Branch validation failed for ${sourceName}`, e);
            // Default to rigorous validation (reject) on failure
            return false;
        }
    }

    /**
     * ✅ NEW: Phase 3 - Validate Parent-Child Semantic Relationship
     * Returns: { valid: boolean; reason: string }
     */
    public async validateParentChildRelationship(
        parentName: string,
        childName: string,
        parentContent?: string,
        childContent?: string,
        mtimeParent: number = 0,
        mtimeChild: number = 0,
        signal?: AbortSignal,
    ): Promise<{ valid: boolean; reason: string }> {
        if (!this.settings.llmEndpoint || !this.settings.llmModelName) {
            return { valid: true, reason: 'LLM not configured - skipping validation' };
        }

        const cacheKey = `relation:${parentName}:${childName}:${mtimeParent}:${mtimeChild}`;
        const cached = this.verificationCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            HealerLogger.debug(`Relation validation cache hit (Content Aware): ${cacheKey}`);
            return cached.result as { valid: boolean; reason: string };
        }

        const prompt = `
[CONTEXT: Knowledge Graph Parent-Child Validation]

=== PARENT CONCEPT ===
Name: ${parentName}
Content Preview: ${parentContent?.substring(0, 500) || 'Not provided'}

=== CHILD CONCEPT ===
Name: ${childName}
Content Preview: ${childContent?.substring(0, 500) || 'Not provided'}

=== VALIDATION TASK ===
Question: Is "${childName}" a SEMANTICALLY APPROPRIATE child/subcategory of "${parentName}"?

Consider:
1. Does the child logically belong under this parent?
2. Is this a valid subcategory/supertype relationship?
3. Would this confuse users navigating the hierarchy?

Respond in this exact format:
VALID: <brief explanation>
OR
INVALID: <brief explanation why>
`.trim();

        try {
            const response = await this.callLlm(prompt, false);
            const isInvalid = response.toUpperCase().includes('INVALID');
            const isValid = response.toUpperCase().includes('VALID') && !isInvalid;

            const reasonParts = response.split(':');
            const reason = reasonParts.length > 1 ? reasonParts.slice(1).join(':').trim() : 'No explanation provided';

            const result = { valid: isValid, reason };
            this.verificationCache.set(cacheKey, {
                result: result,
                timestamp: Date.now(),
            });

            return result;
        } catch (e) {
            HealerLogger.error(`Parent-child validation failed for ${parentName} → ${childName}`, e);
            return { valid: true, reason: 'Validation error - assuming valid' };
        }
    }

    /**
     * ✅ NEW: Phase 3 - BATCH Semantic Audit (Cost & Speed Optimization)
     * Validates multiple children against a single parent in ONE LLM call.
     */
    public async validateRelationshipsBatch(
        parentName: string,
        children: Array<{ name: string; content: string; mtime: number }>,
        parentContent: string = '',
        mtimeParent: number = 0,
        signal?: AbortSignal,
    ): Promise<Record<string, { valid: boolean; reason: string }>> {
        if (!this.settings.llmEndpoint || !this.settings.llmModelName || children.length === 0) {
            return {};
        }

        const results: Record<string, { valid: boolean; reason: string }> = {};
        const toCheck: typeof children = [];

        // 1. Check Cache First
        for (const child of children) {
            const cacheKey = `relation:${parentName}:${child.name}:${mtimeParent}:${child.mtime}`;
            const cached = this.verificationCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
                results[child.name] = cached.result as { valid: boolean; reason: string };
            } else {
                toCheck.push(child);
            }
        }

        if (toCheck.length === 0) return results;

        // 2. Perform Batch AI Call (Surgically Chunked into groups of 10 for rate-limit protection)
        const CHUNK_SIZE = 10;
        for (let i = 0; i < toCheck.length; i += CHUNK_SIZE) {
            if (signal?.aborted) return results;

            const chunk = toCheck.slice(i, i + CHUNK_SIZE);
            const batchPrompt = `
[CONTEXT: Knowledge Graph Semantic Integrity Audit]

=== PARENT CONCEPT ===
Name: ${parentName}
Context: ${parentContent.substring(0, 1000) || 'None provided'}

=== CHILDREN TO VALIDATE ===
${chunk
    .map(
        (c, idx) => `
ID: child_${idx}
Name: ${c.name}
Preview: ${c.content.substring(0, 500) || 'None provided'}
`,
    )
    .join('\n---\n')}

=== GOAL ===
Return a JSON array of objects, one for each ID provided.
Format: { "id": string, "valid": boolean, "reason": "Short explanation why" }
Only return the JSON. No markdown or meta-talk.
`;

            try {
                const response = await this.callLlm(batchPrompt, false, signal);
                // Extract JSON array
                const jsonMatch = response.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]) as Array<{
                        id: string;
                        valid: boolean;
                        reason: string;
                    }>;
                    parsed.forEach((item, idx) => {
                        const child = chunk[idx];
                        if (child) {
                            const res = { valid: item.valid, reason: item.reason };
                            results[child.name] = res;
                            // Cache result
                            const cacheKey = `relation:${parentName}:${child.name}:${mtimeParent}:${child.mtime}`;
                            this.verificationCache.set(cacheKey, {
                                result: res,
                                timestamp: Date.now(),
                            });
                        }
                    });
                }
            } catch (e) {
                HealerLogger.error(`Batch validation failed for chunk starting at ${i} of parent ${parentName}`, e);
            }
        }

        return results;
    }

    /**
     * Helper to extract text from an OpenAI Responses API response
     */
    private extractResponsesText(json: LlmResponse): string {
        const output = Array.isArray(json?.output) ? json.output : [];
        const parts: string[] = [];

        for (const item of output) {
            if (!item || typeof item !== 'object') continue;
            const content = Array.isArray((item as Record<string, unknown>).content)
                ? (item as Record<string, unknown>).content
                : [];
            for (const c of content as unknown[]) {
                if (!c || typeof c !== 'object') continue;
                const record = c as Record<string, unknown>;
                if (typeof record.text === 'string') parts.push(record.text);
                if (typeof record.output_text === 'string') parts.push(record.output_text);
                if (typeof record.content === 'string') parts.push(record.content);
            }
        }
        return parts.join('\n').trim();
    }

    /**
     * Validation method for LLM responses
     */
    private validateLlmResponse(json: LlmResponse, isResponsesApi: boolean = false): boolean {
        if (!json) return false;
        if (isResponsesApi) {
            return Array.isArray(json.output);
        }
        if (json.choices && Array.isArray(json.choices) && json.choices.length > 0) {
            return !!json.choices[0].message?.content;
        }
        return !!(json.message?.content || json.response);
    }

    /**
     * Intelligent model detection for local/cloud endpoints.
     */
    public async runModelDetection(endpoint: string, apiKey: string): Promise<string[]> {
        const tryEndpoints = [
            endpoint.endsWith('/') ? `${endpoint}models` : `${endpoint}/models`,
            endpoint.endsWith('/') ? `${endpoint}v1/models` : `${endpoint}/v1/models`,
        ];

        for (const url of tryEndpoints) {
            try {
                const response = await requestUrl({
                    url,
                    method: 'GET',
                    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
                });

                if (response.status === 200) {
                    interface ModelResponse {
                        data?: { id: string }[];
                        models?: { name: string }[];
                    }
                    const data = response.json as ModelResponse;
                    const models: string[] = [];

                    if (data.data && Array.isArray(data.data)) {
                        data.data.forEach((m) => models.push(m.id));
                    } else if (data.models && Array.isArray(data.models)) {
                        data.models.forEach((m) => models.push(m.name));
                    }
                    if (models.length > 0) return models;
                }
            } catch {
                HealerLogger.warn(`Endpoint path ${url} failed, trying fallback...`);
            }
        }
        return [];
    }

    /**
     * Parses the LLM reasoning response into structured data.
     */
    public parseReasoningResult(raw: string): Omit<ReasoningResult, 'rawResponse'> {
        const result: Omit<ReasoningResult, 'rawResponse'> = {
            winner: '',
            winnerScore: 0,
            winnerWhy: '',
            runnerUp: '',
            runnerUpScore: 0,
            runnerUpWhy: '',
        };

        try {
            // SOTA 2026: Strip audit tags before parsing to ensure we only look at primary reasoning
            const mainContent = raw.replace(/<tribunal_audit>[\s\S]*?<\/tribunal_audit>/g, '').trim();

            const winnerMatch = mainContent.match(
                /WINNER:\s*(?:\[\[)?(.*?)(?:\]\])?\s*\|\s*SCORE:\s*(\d+)%?\s*\|\s*WHY:\s*(.*)/i,
            );
            if (winnerMatch) {
                result.winner = winnerMatch[1].trim();
                result.winnerScore = parseInt(winnerMatch[2]);
                result.winnerWhy = winnerMatch[3].trim();
            }

            const runnerUpMatch = raw.match(
                /RUNNERUP:\s*(?:\[\[)?(.*?)(?:\]\])?\s*\|\s*SCORE:\s*(\d+)%?\s*\|\s*WHY:\s*(.*)/i,
            );
            if (runnerUpMatch) {
                result.runnerUp = runnerUpMatch[1].trim();
                result.runnerUpScore = parseInt(runnerUpMatch[2]);
                result.runnerUpWhy = runnerUpMatch[3].trim();
            }

            if (!result.winner) {
                const lines = mainContent.split('\n');
                for (const line of lines) {
                    if (line.toUpperCase().includes('WINNER:')) {
                        const clean = line
                            .replace(/WINNER:/i, '')
                            .replace(/[[\]]/g, '')
                            .trim();
                        result.winner = clean.split('|')[0].trim();
                        break;
                    }
                }
            }
        } catch (e) {
            HealerLogger.error('Failed to parse reasoning result', e);
        }

        return result;
    }
}
