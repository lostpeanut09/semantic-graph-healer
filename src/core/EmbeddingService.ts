import { requestUrl } from 'obsidian';
import type { SemanticGraphHealerSettings } from '../types';
import { HealerLogger, cosineSimilarity } from './HealerUtils';

export type ModelStatus = 'STABLE' | 'MISALIGNED' | 'OFFLINE';

interface EmbeddingResponse {
    embedding?: number[];
    embeddings?: number[][];
    data?: Array<{ embedding: number[] }>;
    error?: string | { message?: string };
}

/**
 * EmbeddingService: Handles vector generation via local and remote providers.
 * Hardened with Semantic Anchors (HARDEN-08).
 */
export class EmbeddingService {
    private _modelStatus: ModelStatus = 'OFFLINE';

    /**
     * Initializes the EmbeddingService.
     * @param settings - The plugin settings.
     */
    constructor(private settings: SemanticGraphHealerSettings) {}

    /**
     * Gets the current status of the embedding model.
     * @returns The model status ('STABLE', 'MISALIGNED', or 'OFFLINE').
     */
    public get modelStatus(): ModelStatus {
        return this._modelStatus;
    }

    /**
     * Generates an embedding vector for the given text.
     * @param text - The input text to embed.
     * @returns A promise resolving to the embedding vector.
     * @throws Error if the provider fails or endpoint/model is not configured.
     */
    public async getEmbedding(text: string): Promise<number[]> {
        const provider = this.settings.embeddingProvider;
        const endpoint = this.settings.embeddingEndpoint;
        const model = this.settings.embeddingModel;

        if (!endpoint || !model) {
            throw new Error('Embedding endpoint or model not configured.');
        }

        return this.queryModel(text, endpoint, model, provider);
    }

    /**
     * Queries the embedding model with retry logic.
     * @param text - The text to embed.
     * @param endpoint - The API endpoint URL.
     * @param model - The model name.
     * @param provider - The provider type.
     * @param retryCount - Internal retry counter.
     * @returns A promise resolving to the embedding vector.
     */
    private async queryModel(
        text: string,
        endpoint: string,
        model: string,
        provider: 'ollama' | 'localai' | 'openai',
        retryCount: number = 0,
    ): Promise<number[]> {
        const MAX_RETRIES = 2;
        const cleanEp = endpoint.replace(/\/+$/, '');

        let targetUrl = cleanEp;
        const body: Record<string, unknown> = { model };

        if (provider === 'ollama') {
            if (!targetUrl.endsWith('/api/embeddings')) {
                targetUrl = `${targetUrl}/api/embeddings`;
            }
            body['prompt'] = text;
        } else {
            // LocalAI / OpenAI compatible
            if (!targetUrl.endsWith('/v1/embeddings')) {
                if (targetUrl.includes('localhost') || targetUrl.includes('127.0.0.1')) {
                    if (!targetUrl.includes('/v1')) {
                        targetUrl = `${targetUrl}/v1/embeddings`;
                    } else {
                        targetUrl = `${targetUrl}/embeddings`;
                    }
                } else {
                    targetUrl = `${targetUrl}/v1/embeddings`;
                }
            }
            body['input'] = text;
        }

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        // For OpenAI we might need an API key from settings if provided
        // In this implementation we assume local-first, but we should check settings if we ever add openaiApiKey
        // For now, only LocalAI/Ollama priority.

        try {
            const response = await requestUrl({
                url: targetUrl,
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                throw: false,
            });

            if (response.status === 200) {
                const json = response.json as EmbeddingResponse;
                let vector: number[] | undefined;

                if (provider === 'ollama') {
                    vector = json.embedding;
                } else {
                    vector = json.data?.[0]?.embedding;
                }

                if (vector && Array.isArray(vector)) {
                    if (vector.length !== this.settings.embeddingDimensions) {
                        HealerLogger.warn(
                            `EmbeddingService: Vector dimension mismatch. Expected ${this.settings.embeddingDimensions}, got ${vector.length}`,
                        );
                    }
                    return vector;
                }
            }

            if (retryCount < MAX_RETRIES) {
                const delay = Math.pow(2, retryCount) * 1000;
                HealerLogger.warn(`EmbeddingService: Request failed (${response.status}). Retrying in ${delay}ms...`);
                await new Promise((r) => setTimeout(r, delay));
                return this.queryModel(text, endpoint, model, provider, retryCount + 1);
            }

            throw new Error(`Embedding provider failed with status ${response.status}`);
        } catch (e) {
            if (retryCount < MAX_RETRIES) {
                const delay = Math.pow(2, retryCount) * 1000;
                HealerLogger.warn(`EmbeddingService: Exception occurred. Retrying in ${delay}ms...`, e);
                await new Promise((r) => setTimeout(r, delay));
                return this.queryModel(text, endpoint, model, provider, retryCount + 1);
            }
            throw e;
        }
    }

    /**
     * Semantic Anchor Check: Verifies model alignment using concept pairs.
     * (HARDEN-08)
     * @returns A promise resolving to true if the model is aligned, false otherwise.
     */
    public async checkModelAlignment(): Promise<boolean> {
        HealerLogger.info('EmbeddingService: Running Semantic Anchor check...');

        const pairs = [
            { a: 'king', b: 'queen', min: 0.6 },
            { a: 'apple', b: 'fruit', min: 0.5 },
            { a: 'cat', b: 'dog', min: 0.4 },
            { a: 'cat', b: 'car', max: 0.3 },
            { a: 'fast', b: 'quick', min: 0.7 },
            { a: 'hot', b: 'cold', max: 0.5 }, // Antonyms might be similar in vector space, but not TOO similar
            { a: 'physics', b: 'science', min: 0.6 },
            { a: 'blue', b: 'color', min: 0.6 },
            { a: 'walk', b: 'run', min: 0.5 },
            { a: 'pencil', b: 'eraser', min: 0.4 },
        ];

        try {
            let passedCount = 0;
            for (const pair of pairs) {
                const vecA = await this.getEmbedding(pair.a);
                const vecB = await this.getEmbedding(pair.b);
                const sim = cosineSimilarity(vecA, vecB);

                let ok = true;
                if (pair.min !== undefined && sim < pair.min) ok = false;
                if (pair.max !== undefined && sim > pair.max) ok = false;

                if (ok) passedCount++;
                HealerLogger.debug(`Anchor [${pair.a} <-> ${pair.b}]: ${sim.toFixed(4)} - ${ok ? 'PASS' : 'FAIL'}`);
            }

            const passRatio = passedCount / pairs.length;
            if (passRatio >= 0.7) {
                this._modelStatus = 'STABLE';
                HealerLogger.info(`EmbeddingService: Model aligned (Pass Ratio: ${passRatio * 100}%)`);
                return true;
            } else {
                this._modelStatus = 'MISALIGNED';
                HealerLogger.warn(`EmbeddingService: Model MISALIGNED (Pass Ratio: ${passRatio * 100}%)`);
                return false;
            }
        } catch (e) {
            this._modelStatus = 'OFFLINE';
            HealerLogger.error('EmbeddingService: Alignment check failed (Model Offline)', e);
            return false;
        }
    }
}
