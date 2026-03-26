import { requestUrl } from 'obsidian';
import { SemanticGraphHealerSettings } from '../types';
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
        ): Promise<string> => {
            try {
                const timeoutMs = (timeoutSec || 30) * 1000;
                // NOTE: AbortController is used for flow control, but Obsidian's requestUrl
                // doesn't natively support AbortSignal. This is a semantic cancellation only.
                const controller = new AbortController();
                const timeoutSignal = new Promise((_, reject) => {
                    setTimeout(() => {
                        controller.abort();
                        reject(new Error('Timeout'));
                    }, timeoutMs);
                });

                const fetchPromise = requestUrl({
                    url: endpoint.endsWith('/') ? `${endpoint}chat/completions` : `${endpoint}/chat/completions`,
                    method: 'POST',
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [{ role: 'user', content: prompt }],
                        max_tokens: this.settings.aiMaxTokens || 1000,
                    }),
                    throw: false,
                });

                const response = (await Promise.race([fetchPromise, timeoutSignal])) as {
                    status: number;
                    json: LlmResponse;
                };

                if (response.status !== 200) {
                    throw new LlmError(model, response.status, 'Endpoint rejected request');
                }

                const json = response.json;
                if (json?.choices?.[0]?.message?.content) {
                    return json.choices[0].message.content;
                }

                // Fallback for some local servers
                if (json?.message?.content) return json.message.content;
                if (json?.response) return json.response;

                return '';
            } catch (e) {
                HealerLogger.error(`LLM error [${model}]:`, e);
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

        // --- SEMANTIC CONSENSUS VERIFICATION ---
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
     * Intelligent model detection for local/cloud endpoints.
     */
    public async runModelDetection(endpoint: string, apiKey: string): Promise<string[]> {
        HealerLogger.info(`Probing endpoint: ${endpoint}`);
        const tryEndpoints = [
            endpoint.endsWith('/') ? `${endpoint}models` : `${endpoint}/models`,
            endpoint.endsWith('/') ? `${endpoint}v1/models` : `${endpoint}/v1/models`,
            endpoint.endsWith('/') ? `${endpoint}api/tags` : `${endpoint}/api/tags`,
        ];

        for (const url of tryEndpoints) {
            try {
                const response = await requestUrl({
                    url,
                    method: 'GET',
                    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
                    throw: false,
                });

                if (response.status === 200) {
                    const json = response.json;
                    if (json && Array.isArray(json.data)) {
                        return (json.data as Array<{ id?: string; name?: string }>)
                            .map((m) => m.id || m.name)
                            .filter((m): m is string => Boolean(m));
                    }
                    if (json && Array.isArray(json.models)) {
                        return (json.models as Array<{ id?: string; name?: string }>)
                            .map((m) => m.name || m.id)
                            .filter((m): m is string => Boolean(m));
                    }
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
    public parseReasoningResult(raw: string): {
        winner: string | null;
        winnerScore: number;
        winnerWhy: string;
        runnerUp: string | null;
        runnerUpScore: number;
        runnerUpWhy: string;
    } {
        const result = {
            winner: null as string | null,
            winnerScore: 0,
            winnerWhy: '',
            runnerUp: null as string | null,
            runnerUpScore: 0,
            runnerUpWhy: '',
        };

        const winnerMatch = raw.match(/WINNER:\s*(?:\[\[)?(.*?)(?:\]\])?\s*\|\s*SCORE:\s*(\d+)%?\s*\|\s*WHY:\s*(.*)/i);
        if (winnerMatch) {
            result.winner = winnerMatch[1].trim();
            result.winnerScore = parseInt(winnerMatch[2]);
            result.winnerWhy = winnerMatch[3].split('|')[0].trim();
        }

        const runnerUpMatch = raw.match(
            /RUNNERUP:\s*(?:\[\[)?(.*?)(?:\]\])?\s*\|\s*SCORE:\s*(\d+)%?\s*\|\s*WHY:\s*(.*)/i,
        );
        if (runnerUpMatch) {
            result.runnerUp = runnerUpMatch[1].trim();
            result.runnerUpScore = parseInt(runnerUpMatch[2]);
            result.runnerUpWhy = runnerUpMatch[3].split('|')[0].trim();
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

        return result;
    }
}
