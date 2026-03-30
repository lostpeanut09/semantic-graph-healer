import { requestUrl } from 'obsidian';
import { SemanticGraphHealerSettings, ReasoningResult } from '../types';
import { HealerLogger } from './HealerUtils';

/**
 * Custom Error for LLM operations.
 */
export class LlmError extends Error {
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
    constructor(
        private settings: SemanticGraphHealerSettings,
        private getApiKey: (isPrimary: boolean) => Promise<string>,
    ) {}

    /**
     * Executes an AI query against the configured provider.
     */
    public async callLlm(prompt: string, useTribunal: boolean = false): Promise<string> {
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

            const makeRequest = async (): Promise<{ status: number; json: LlmResponse }> => {
                let timer: ReturnType<typeof setTimeout> | null = null;

                const bodyJson = {
                    model: model,
                    max_tokens: this.settings.aiMaxTokens || 1000,
                    temperature: this.settings.aiTemperature ?? 0.7,
                } as Record<string, unknown>;

                // ✅ FORWARD-COMPATIBILITY: OpenAI Responses API 2026 (/v1/responses)
                const isResponsesApi = endpoint.includes('/v1/responses');
                if (isResponsesApi) {
                    bodyJson['instructions'] = 'You are the Supreme Tribunal of the Knowledge Graph.';
                    bodyJson['input'] = prompt;
                } else {
                    bodyJson['messages'] = [{ role: 'user', content: prompt }];
                }

                // ✅ FIX: Use correct endpoint for Responses API
                const apiPath = isResponsesApi ? 'responses' : 'chat/completions';
                const fetchPromise = requestUrl({
                    url: endpoint.endsWith('/') ? `${endpoint}${apiPath}` : `${endpoint}/${apiPath}`,
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                        'User-Agent': 'SemanticGraphHealer/2026.3',
                    },
                    body: JSON.stringify(bodyJson),
                    throw: false,
                });

                const timeoutSignal = new Promise<never>((_, reject) => {
                    timer = setTimeout(() => {
                        reject(new Error('Timeout'));
                    }, timeoutMs);
                });

                try {
                    const response = (await Promise.race([fetchPromise, timeoutSignal])) as {
                        status: number;
                        json: LlmResponse;
                    };
                    if (timer) clearTimeout(timer);
                    return response;
                } catch (e) {
                    if (timer) clearTimeout(timer);
                    throw e;
                }
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
                if (!this.validateLlmResponse(json)) {
                    HealerLogger.warn(`Invalid LLM response structure: ${JSON.stringify(json).slice(0, 200)}`);
                    return '';
                }

                return (
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

        const primaryApiKey = await this.getApiKey(true);
        const result = await queryModel(
            this.settings.llmEndpoint,
            primaryApiKey,
            this.settings.llmModelName,
            this.settings.primaryTimeout,
        );

        if (!useTribunal || !this.settings.enableAiTribunal) return result;

        // TRIBUNAL LOGIC (SOTA 2026 Consensus Verification)
        const secondaryApiKey = await this.getApiKey(false);
        const secondResult = await queryModel(
            this.settings.secondaryLlmEndpoint,
            secondaryApiKey,
            this.settings.secondaryLlmModelName,
            this.settings.secondaryTimeout,
        );

        const firstWinner = this.parseReasoningResult(result).winner?.toLowerCase();
        const secondWinner = this.parseReasoningResult(secondResult).winner?.toLowerCase();

        let consensusState = 'STABLE';
        if (firstWinner && secondWinner && firstWinner !== secondWinner) {
            consensusState = 'CONFLICT';
        } else if (!firstWinner || !secondWinner) {
            consensusState = 'UNCERTAIN';
        }

        return `${result}\n\n[Consensus Report]\nStatus: ${consensusState}\nSecondary Model Output: ${secondResult}`;
    }

    /**
     * ✅ NEW: Validation method for LLM responses
     */
    private validateLlmResponse(json: LlmResponse): boolean {
        if (!json) return false;
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
            const winnerMatch = raw.match(
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
                const lines = raw.split('\n');
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
