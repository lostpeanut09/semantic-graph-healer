import { requestUrl } from "obsidian";
import type { RequestUrlParam } from "obsidian";
import type { SemanticGraphHealerSettings, ReasoningResult } from "../types";
import { HealerLogger } from "./utils/HealerLogger";
import { getProviderFromEndpoint, cosineSimilarity } from "./HealerUtils";
import type { ApiKeyType } from "./HealerUtils";
import { LlmError } from "./errors/HealerError";

/**
 * Standard structure for LLM API responses.
 */
interface LlmResponse {
  /** OpenAI-style choices array. */
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  /** Anthropic/Custom-style output array. */
  output?: unknown[];
  /** Generic message object. */
  message?: {
    content?: string;
  };
  /** Generic response string. */
  response?: string;
  /** Generic data object. */
  data?: unknown;
  /** Model list data. */
  models?: unknown;
  /** Error message or object. */
  error?: string | { message?: string };
}

/**
 * LlmService: Orchestrates AI operations and model detection.
 * SOTA 2026 Modular Architecture.
 */
export class LlmService {
  private verificationCache = new Map<
    string,
    { result: unknown; timestamp: number }
  >();
  private readonly CACHE_TTL = 300000; // 5 minutes
  private cacheCleanupInterval: ReturnType<typeof setInterval>;

  /**
   * Initializes the LlmService.
   * @param settings - The plugin settings.
   * @param getKey - Function to retrieve API keys for specific providers.
   */
  constructor(
    private settings: SemanticGraphHealerSettings,
    private getKey: (type: ApiKeyType) => Promise<string>,
  ) {
    // Run cleanup periodically
    this.cacheCleanupInterval = setInterval(() => this.cleanupCache(), 600000);
  }

  /**
   * Cleans up resources used by the service.
   */
  public destroy(): void {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
    }
  }

  /**
   * Removes expired entries from the verification cache.
   */
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
   * @param prompt - The instruction or content to send to the LLM.
   * @param useTribunal - Whether to use the AI Tribunal (dual-LLM consensus) for this call.
   * @param signal - Optional abort signal to cancel the request.
   * @param embeddings - Optional embeddings for pre-filtering (similarity check).
   * @returns A promise that resolves to the LLM's response string.
   * @throws LlmError if the API request fails.
   */
  public async callLlm(
    prompt: string,
    useTribunal: boolean = false,
    signal?: AbortSignal,
    embeddings?: { source: number[]; target: number[] },
  ): Promise<string> {
    if (signal?.aborted) throw new Error("AbortError");

    // STAGE 0 PRE-FILTER (HARDEN-08)
    if (useTribunal && this.settings.enableAiTribunal && embeddings) {
      const similarity = cosineSimilarity(embeddings.source, embeddings.target);
      const threshold = this.settings.tribunalPreFilterThreshold ?? 0.4;
      if (similarity < threshold) {
        HealerLogger.info(
          `LlmService: Tribunal Bypassed (Stage 0). Similarity ${similarity.toFixed(4)} < ${threshold}`,
        );
        return `REJECTED\n\n<tribunal_audit>\nStatus: REJECTED\nConfidenceScore: 0\nPrimaryReasoning: SEMANTIC_UNRELATED\n</tribunal_audit>`;
      }
    }

    const primaryProvider = getProviderFromEndpoint(this.settings.llmEndpoint);
    const primaryKeyType =
      primaryProvider === "openai" ? "openai" : primaryProvider;

    HealerLogger.info(
      `LlmService: Call initiated. Primary model: ${this.settings.llmModelName}, Provider: ${primaryProvider}`,
    );

    const primaryApiKey = await this.getKey(primaryKeyType);

    if (
      primaryProvider === "custom" &&
      (!primaryApiKey || primaryApiKey === "sk-local")
    ) {
      HealerLogger.info(
        "LlmService: Local/Custom model detected. If this is Ollama, ensure it is running and the model is pulled.",
      );
    }

    const queryModel = async (
      endpoint: string,
      apiKey: string,
      model: string,
      timeoutSec: number,
      retryCount: number = 0,
    ): Promise<string> => {
      HealerLogger.debug(
        `LlmService: Querying model ${model} at ${endpoint} (Attempt ${retryCount + 1})`,
      );

      const timeoutMs = (timeoutSec || 30) * 1000;
      const MAX_RETRIES = this.settings.llmMaxRetries || 2;
      const RETRYABLE_STATUSES = this.settings.llmRetryableStatuses || [
        429, 408, 503,
      ];

      const cleanEp = endpoint.replace(/\/+$/, "");
      const isResponsesApi = cleanEp.endsWith("/v1/responses");
      const apiPath = isResponsesApi
        ? "responses"
        : ("chat/completions" as const);

      const makeRequest = async (): Promise<{
        status: number;
        json: LlmResponse;
      }> => {
        const bodyJson = {
          model: model,
          max_tokens: this.settings.aiMaxTokens || 1000,
          temperature: this.settings.aiTemperature ?? 0.7,
        } as Record<string, unknown>;

        const normalizeEndpoint = (
          ep: string,
          tgtPath: "responses" | "chat/completions",
        ) => {
          let base = ep.trim().replace(/\/+$/, "");

          if (
            !base.includes(".com") &&
            !base.includes(".ai") &&
            !base.includes("/v1")
          ) {
            if (
              base.match(/^(http:\/\/)?(\d{1,3}\.){3}\d{1,3}(:\d+)?$/) ||
              base.includes("localhost")
            ) {
              base = `${base}/v1`;
            }
          }

          if (base.endsWith(`/${tgtPath}`)) return base;
          if (base.endsWith("/v1")) return `${base}/${tgtPath}`;
          return `${base}/${tgtPath}`;
        };

        if (isResponsesApi) {
          bodyJson["instructions"] =
            "You are the Supreme Tribunal of the Knowledge Graph.";
          bodyJson["input"] = prompt;
          bodyJson["max_output_tokens"] = this.settings.aiMaxTokens || 1000;
          delete bodyJson["max_tokens"];
        } else {
          bodyJson["messages"] = [{ role: "user", content: prompt }];
        }

        interface HealerRequestUrlParam extends RequestUrlParam {
          timeout?: number;
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "User-Agent": "SemanticGraphHealer/2026.3",
        };

        if (apiKey && apiKey !== "sk-local") {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        let timeoutTimer: ReturnType<typeof setTimeout>;
        const logicalTimeoutPromise = new Promise<never>((_, reject) => {
          timeoutTimer = setTimeout(() => {
            reject(
              new Error(
                `TimeoutError: Logical timeout reached (${timeoutMs}ms)`,
              ),
            );
          }, timeoutMs);
        });

        const targetUrl = normalizeEndpoint(endpoint, apiPath);
        HealerLogger.debug(
          `LlmService: Fetching from ${targetUrl} with ${apiKey === "sk-local" ? "NO" : "Bearer"} token`,
        );

        const fetchPromise = requestUrl({
          url: targetUrl,
          method: "POST",
          headers: headers,
          body: JSON.stringify(bodyJson),
          throw: false,
          timeout: timeoutMs,
        } as HealerRequestUrlParam);

        try {
          const response = (await Promise.race([
            fetchPromise,
            logicalTimeoutPromise,
          ])) as {
            status: number;
            json: LlmResponse;
          };
          return response;
        } finally {
          if (timeoutTimer!) clearTimeout(timeoutTimer);
        }
      };

      try {
        const response = await makeRequest();
        if (!response) {
          HealerLogger.warn(`LLM [${model}] returned undefined response.`);
          throw new Error("Undefined response");
        }
        HealerLogger.debug(
          `LlmService: Response status from ${model}: ${response.status}`,
        );

        const shouldRetry =
          (RETRYABLE_STATUSES.includes(response.status) ||
            response.status >= 500) &&
          retryCount < MAX_RETRIES;

        if (shouldRetry) {
          const delay = Math.pow(2, retryCount) * 1000;
          HealerLogger.warn(
            `LLM [${model}] failed (${response.status}). Retry ${retryCount + 1}/${MAX_RETRIES} in ${delay}ms...`,
          );
          await new Promise((r) => setTimeout(r, delay));
          return queryModel(
            endpoint,
            apiKey,
            model,
            timeoutSec,
            retryCount + 1,
          );
        }

        if (response.status !== 200) {
          const json = response.json;
          const errorMsg =
            (typeof json.error === "string"
              ? json.error
              : json.error?.message) ||
            json.message?.content ||
            "Endpoint rejected request";
          HealerLogger.error(
            `LlmService: ${model} query failed with status ${response.status}: ${errorMsg}`,
            response.json,
          );
          throw new LlmError(model, response.status, errorMsg);
        }

        const json = response.json;
        if (!this.validateLlmResponse(json, isResponsesApi)) {
          HealerLogger.warn(
            `LlmService: Invalid LLM response structure from ${model}: ${JSON.stringify(json).slice(0, 200)}`,
          );
          return "";
        }

        return (
          (isResponsesApi ? this.extractResponsesText(json) : "") ||
          json.choices?.[0]?.message?.content?.trim() ||
          json.message?.content?.trim() ||
          json.response?.trim() ||
          ""
        );
      } catch (e) {
        const isTimeout =
          e instanceof Error && e.message.includes("TimeoutError");
        if (!isTimeout && retryCount < MAX_RETRIES) {
          const delay = Math.pow(2, retryCount) * 1000;
          HealerLogger.warn(
            `LLM [${model}] exception: ${e instanceof Error ? e.message : "Unknown"}. Retry ${retryCount + 1}/${MAX_RETRIES} in ${delay}ms...`,
          );
          await new Promise((r) => setTimeout(r, delay));
          return queryModel(
            endpoint,
            apiKey,
            model,
            timeoutSec,
            retryCount + 1,
          );
        }
        if (isTimeout) {
          HealerLogger.warn(
            `LLM [${model}] timed out after ${timeoutSec}s; not retrying.`,
          );
        }

        const finalError = `Error: LLM [${model}] final failure: ${e instanceof Error ? e.message : "Unknown"}`;
        HealerLogger.error(finalError, e);
        return finalError;
      }
    };

    const result = await queryModel(
      this.settings.llmEndpoint,
      primaryApiKey,
      this.settings.llmModelName,
      this.settings.primaryTimeout,
    );

    // CR-01: If the primary model returned an error string (all retries exhausted),
    // bail out immediately instead of treating it as a valid LLM response.
    // Without this check the error string flows into parseReasoningResult()
    // which triggers a spurious (and costly) AI Tribunal invocation.
    if (result.startsWith("Error:")) {
      HealerLogger.error("LlmService: Primary model failed completely", result);
      return `${result}\n\n<tribunal_audit>\nStatus: ERROR\nConfidenceScore: 0\nPrimaryReasoning: Primary model failure — no response available\n</tribunal_audit>`;
    }

    if (!useTribunal || !this.settings.enableAiTribunal) {
      HealerLogger.debug(
        "LlmService: Tribunal disabled or not requested. Returning primary result.",
      );
      return result;
    }

    const primaryParsed = this.parseReasoningResult(result);
    const primaryConfidence = primaryParsed.winnerScore || 0;
    const firstWinner = primaryParsed.winner?.toLowerCase() || "";
    const safeThreshold = this.settings.safeZoneThreshold ?? 80;

    if (primaryConfidence >= safeThreshold) {
      HealerLogger.info(
        `LlmService: Primary confidence (${primaryConfidence}) >= Safe Zone (${safeThreshold}). Bypassing tribunal.`,
      );
      return `${result}\n\n<tribunal_audit>\nStatus: STABLE\nConfidenceScore: ${primaryConfidence}\nPrimaryReasoning: ${primaryParsed.winnerWhy || "N/A"}\n</tribunal_audit>`;
    }

    HealerLogger.info(
      `LlmService: Primary confidence (${primaryConfidence}) < Safe Zone (${safeThreshold}). Initiating Tribunal...`,
    );

    // TRIBUNAL LOGIC (SOTA 2026 Consensus Verification)
    const secondaryEp = this.settings.secondaryLlmEndpoint;
    const secondaryModel = this.settings.secondaryLlmModelName;

    if (!secondaryEp || !secondaryModel) {
      HealerLogger.warn(
        "LlmService: AI Tribunal enabled but secondary model not configured. Returning primary result.",
      );
      return `${result}\n\n<tribunal_audit>\nStatus: STABLE\nConfidenceScore: ${primaryConfidence}\nPrimaryReasoning: ${primaryParsed.winnerWhy || "N/A"}\nNote: Secondary model not configured for verification.\n</tribunal_audit>`;
    }

    const secondaryProvider = getProviderFromEndpoint(secondaryEp);
    const secondaryKeyType =
      secondaryProvider === "openai" ? "openai" : secondaryProvider;
    HealerLogger.debug(
      `LlmService: Fetching secondary key for type: ${secondaryKeyType}`,
    );
    const secondaryApiKey = await this.getKey(secondaryKeyType);

    let secondResult = "";
    let secondWinner = "";
    let consensusState: "STABLE" | "CONFLICT" | "UNCERTAIN" = "STABLE";
    let secondaryConfidence = 0;
    let secondaryWhy = "";

    try {
      secondResult = await queryModel(
        secondaryEp,
        secondaryApiKey,
        secondaryModel,
        this.settings.secondaryTimeout,
      );

      if (secondResult.startsWith("Error:")) {
        HealerLogger.warn(
          "AI Tribunal secondary model returned an error. Falling back to primary result.",
        );
        return `${result}\n\n<tribunal_audit>\nStatus: STABLE\nConfidenceScore: ${primaryConfidence}\nPrimaryReasoning: ${primaryParsed.winnerWhy || "N/A"}\nNote: Secondary model failed with error.\n</tribunal_audit>`;
      }

      const secondaryParsed = this.parseReasoningResult(secondResult);
      secondWinner = secondaryParsed.winner?.toLowerCase() || "";
      secondaryConfidence = secondaryParsed.winnerScore || 0;
      secondaryWhy = secondaryParsed.winnerWhy || "N/A";
      HealerLogger.info(
        `LlmService: Tribunal complete. Consensus: ${consensusState}, SecWinner: ${secondWinner}`,
      );
    } catch (e) {
      HealerLogger.warn(
        "AI Tribunal secondary model failed. Falling back to primary result.",
        e,
      );
      return `${result}\n\n<tribunal_audit>\nStatus: STABLE\nConfidenceScore: ${primaryConfidence}\nPrimaryReasoning: ${primaryParsed.winnerWhy || "N/A"}\n</tribunal_audit>`;
    }

    let finalConfidence = primaryConfidence;
    if (firstWinner && secondWinner && firstWinner !== secondWinner) {
      consensusState = "CONFLICT";
      finalConfidence = Math.floor(
        (primaryConfidence + secondaryConfidence) / 2,
      );
    } else if (!firstWinner || !secondWinner) {
      consensusState = "UNCERTAIN";
      finalConfidence = Math.floor(
        (primaryConfidence + secondaryConfidence) / 2,
      );
    } else {
      consensusState = "STABLE";
      finalConfidence = Math.max(primaryConfidence, secondaryConfidence);
    }

    return `${result}\n\n<tribunal_audit>\nStatus: ${consensusState}\nConfidenceScore: ${finalConfidence}\nPrimaryReasoning: ${primaryParsed.winnerWhy || "N/A"}\nSecondaryReasoning: ${secondaryWhy}\nSecondary Model Output: ${secondResult.replace(/\n/g, " ")}\n</tribunal_audit>`;
  }

  /**
   * ✅ NEW: Phase 3 - Semantic Tag Propagation Validation (Binary YES/NO)
   * @param childName - The name of the child note.
   * @param tag - The tag to validate for inheritance.
   * @param parentName - The name of the parent note.
   * @param childContent - Optional content of the child note.
   * @param parentContent - Optional content of the parent note.
   * @returns A promise that resolves to true if the inheritance is logically valid.
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
      if (this.settings.logLevel === "debug") {
        HealerLogger.debug(`Tag validation cache hit: ${cacheKey}`);
      }
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
Content Preview: ${parentContent?.substring(0, 500) || "Not provided"}

=== CHILD CONCEPT ===
Name: ${childName}
Content Preview: ${childContent?.substring(0, 500) || "Not provided"}

=== VALIDATION TASK ===
Tag to inherit: ${tag}
Question: Does "${childName}" logically belong to the taxonomy "${tag}" based on the content of the notes?

Respond ONLY with: YES or NO`.trim();

    try {
      const response = await this.callLlm(prompt, false);
      const isValid = response.toUpperCase().includes("YES");
      this.verificationCache.set(cacheKey, {
        result: isValid,
        timestamp: Date.now(),
      });
      return isValid;
    } catch (e) {
      HealerLogger.error(`Tag validation failed for ${childName} -> ${tag}`, e);
      return false;
    }
  }

  /**
   * ✅ NEW: Phase 3 - Branch Sequence Validation (Binary VALID/CONTRADICTION)
   * @param sourceName - The name of the source note.
   * @param targetNames - Array of names for the target notes.
   * @param sourceContent - Optional content of the source note.
   * @param targetContents - Optional array of contents for the target notes.
   * @param existingRelations - Optional string describing existing relationships.
   * @returns A promise that resolves to true if the branching is logically valid.
   */
  public async validateBranching(
    sourceName: string,
    targetNames: string[],
    sourceContent?: string,
    targetContents?: string[],
    existingRelations?: string,
  ): Promise<boolean> {
    if (!this.settings.llmEndpoint || !this.settings.llmModelName) return false;

    const cacheKey = `branch:${sourceName}:${targetNames.join(",")}`;
    const cached = this.verificationCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      if (this.settings.logLevel === "debug") {
        HealerLogger.debug(`Branch validation cache hit: ${cacheKey}`);
      }
      return cached.result as boolean;
    }

    const prompt = `
[CONTEXT: Knowledge Graph Sequential Flow Validation]

=== SOURCE NOTE ===
Name: ${sourceName}
Content Preview: ${sourceContent?.substring(0, 500) || "Not provided"}

=== POSSIBLE CONTINUATIONS ===
${targetNames
  .map(
    (name, i) => `
--- Target ${i + 1}: ${name} ---
Content Preview: ${targetContents?.[i]?.substring(0, 300) || "Not provided"}
`,
  )
  .join("\n")}

=== EXISTING RELATIONSHIPS ===
${existingRelations || "No existing relationships found"}

=== VALIDATION TASK ===
Question: Is it logically VALID for "${sourceName}" to have multiple sequential
continuations (${targetNames.join(", ")}), or is this a CONTRADICTION that breaks
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
        response.toUpperCase().includes("VALID") &&
        !response.toUpperCase().includes("CONTRADICTION");
      this.verificationCache.set(cacheKey, {
        result: isValid,
        timestamp: Date.now(),
      });
      return isValid;
    } catch (e) {
      HealerLogger.error(`Branch validation failed for ${sourceName}`, e);
      // Default to rigorous validation (reject) on failure
      return false;
    }
  }

  /**
   * ✅ NEW: Phase 3 - Validate Parent-Child Semantic Relationship
   * @param parentName - Name of the parent note.
   * @param childName - Name of the child note.
   * @param parentContent - Optional content of the parent note.
   * @param childContent - Optional content of the child note.
   * @param mtimeParent - Modification time of the parent note.
   * @param mtimeChild - Modification time of the child note.
   * @param signal - Optional abort signal.
   * @returns A promise that resolves to an object containing validity and reasoning.
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
      return {
        valid: true,
        reason: "LLM not configured - skipping validation",
      };
    }

    const cacheKey = `relation:${parentName}:${childName}:${mtimeParent}:${mtimeChild}`;
    const cached = this.verificationCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      if (this.settings.logLevel === "debug") {
        HealerLogger.debug(
          `Relation validation cache hit (Content Aware): ${cacheKey}`,
        );
      }
      return cached.result as { valid: boolean; reason: string };
    }

    const prompt = `
[CONTEXT: Knowledge Graph Parent-Child Validation]

=== PARENT CONCEPT ===
Name: ${parentName}
Content Preview: ${parentContent?.substring(0, 500) || "Not provided"}

=== CHILD CONCEPT ===
Name: ${childName}
Content Preview: ${childContent?.substring(0, 500) || "Not provided"}

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
      const isInvalid = response.toUpperCase().includes("INVALID");
      const isValid = response.toUpperCase().includes("VALID") && !isInvalid;

      const reasonParts = response.split(":");
      const reason =
        reasonParts.length > 1
          ? reasonParts.slice(1).join(":").trim()
          : "No explanation provided";

      const result = { valid: isValid, reason };
      this.verificationCache.set(cacheKey, {
        result: result,
        timestamp: Date.now(),
      });

      return result;
    } catch (e) {
      HealerLogger.error(
        `Parent-child validation failed for ${parentName} → ${childName}`,
        e,
      );
      return { valid: true, reason: "Validation error - assuming valid" };
    }
  }

  /**
   * ✅ NEW: Phase 3 - BATCH Semantic Audit (Cost & Speed Optimization)
   * Validates multiple children against a single parent in ONE LLM call.
   * @param parentName - Name of the parent note.
   * @param children - Array of children note data.
   * @param parentContent - Content of the parent note.
   * @param mtimeParent - Modification time of the parent note.
   * @param signal - Optional abort signal.
   * @returns A promise that resolves to a record of child names and their validation results.
   */
  public async validateRelationshipsBatch(
    parentName: string,
    children: Array<{ name: string; content: string; mtime: number }>,
    parentContent: string = "",
    mtimeParent: number = 0,
    signal?: AbortSignal,
  ): Promise<Record<string, { valid: boolean; reason: string }>> {
    if (
      !this.settings.llmEndpoint ||
      !this.settings.llmModelName ||
      children.length === 0
    ) {
      return {};
    }

    const results: Record<string, { valid: boolean; reason: string }> = {};
    const toCheck: typeof children = [];

    // 1. Check Cache First
    for (const child of children) {
      const cacheKey = `relation:${parentName}:${child.name}:${mtimeParent}:${child.mtime}`;
      const cached = this.verificationCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        results[child.name] = cached.result as {
          valid: boolean;
          reason: string;
        };
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
Context: ${parentContent.substring(0, 1000) || "None provided"}

=== CHILDREN TO VALIDATE ===
${chunk
  .map(
    (c, idx) => `
ID: child_${idx}
Name: ${c.name}
Preview: ${c.content.substring(0, 500) || "None provided"}
`,
  )
  .join("\n---\n")}

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
        HealerLogger.error(
          `Batch validation failed for chunk starting at ${i} of parent ${parentName}`,
          e,
        );
      }
    }

    return results;
  }

  /**
   * Helper to extract text from an OpenAI Responses API response
   * @param json - The LLM response object.
   * @returns The extracted text string.
   */
  private extractResponsesText(json: LlmResponse): string {
    const output = Array.isArray(json?.output) ? json.output : [];
    const parts: string[] = [];

    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const content = Array.isArray((item as Record<string, unknown>).content)
        ? (item as Record<string, unknown>).content
        : [];
      for (const c of content as unknown[]) {
        if (!c || typeof c !== "object") continue;
        const record = c as Record<string, unknown>;
        if (typeof record.text === "string") parts.push(record.text);
        if (typeof record.output_text === "string")
          parts.push(record.output_text);
        if (typeof record.content === "string") parts.push(record.content);
      }
    }
    return parts.join("\n").trim();
  }

  /**
   * Validation method for LLM responses
   * @param json - The LLM response object to validate.
   * @param isResponsesApi - Whether the response is from the Responses API.
   * @returns True if the response structure is valid.
   */
  private validateLlmResponse(
    json: LlmResponse,
    isResponsesApi: boolean = false,
  ): boolean {
    if (!json) return false;
    if (isResponsesApi) {
      return Array.isArray(json.output);
    }
    if (
      json.choices &&
      Array.isArray(json.choices) &&
      json.choices.length > 0
    ) {
      return !!json.choices[0].message?.content;
    }
    return !!(json.message?.content || json.response);
  }

  /**
   * Detects available models at a given endpoint.
   * @param endpoint - The API endpoint URL.
   * @param apiKey - The API key to use for authentication.
   * @returns A promise that resolves to an array of model names.
   */
  public async runModelDetection(
    endpoint: string,
    apiKey: string,
  ): Promise<string[]> {
    const tryEndpoints = [
      endpoint.endsWith("/") ? `${endpoint}v1/models` : `${endpoint}/v1/models`,
      endpoint.endsWith("/") ? `${endpoint}models` : `${endpoint}/models`,
      endpoint.endsWith("/") ? `${endpoint}api/tags` : `${endpoint}/api/tags`, // Ollama native
    ];

    for (const url of tryEndpoints) {
      try {
        const headers: Record<string, string> = {};
        if (apiKey && apiKey !== "sk-local") {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }

        HealerLogger.debug(`LlmService: Attempting model detection at ${url}`);
        const response = await requestUrl({
          url,
          method: "GET",
          headers,
        });

        if (response.status === 200) {
          interface ModelResponse {
            data?: { id: string }[];
            models?: Array<{ name: string; model?: string }>;
          }
          const data = response.json as ModelResponse;
          const models: string[] = [];

          if (data.data && Array.isArray(data.data)) {
            data.data.forEach((m) => models.push(m.id));
          } else if (data.models && Array.isArray(data.models)) {
            data.models.forEach((m) => {
              const name = m.name || m.model;
              if (name) models.push(name);
            });
          }

          if (models.length > 0) {
            HealerLogger.info(
              `LlmService: Detected ${models.length} models at ${url}`,
            );
            return models;
          }
        }
      } catch {
        HealerLogger.debug(
          `LlmService: Endpoint path ${url} failed or timed out.`,
        );
      }
    }
    return [];
  }

  /**
   * Parses the LLM reasoning response into structured data.
   * @param raw - The raw string response from the LLM.
   * @returns A structured ReasoningResult object.
   */
  public parseReasoningResult(raw: string): ReasoningResult {
    const result: ReasoningResult = {
      winner: null,
      winnerScore: 0,
      winnerWhy: "",
      runnerUp: null,
      runnerUpScore: 0,
      runnerUpWhy: "",
      rawResponse: raw,
    };

    try {
      const auditMatch = raw.match(
        /<tribunal_audit>([\s\S]*?)<\/tribunal_audit>/,
      );
      if (auditMatch) {
        const auditContent = auditMatch[1];
        const statusMatch = auditContent.match(/Status:\s*([A-Z]+)/i);
        if (statusMatch)
          result.verdict = statusMatch[1].toUpperCase() as
            | "STABLE"
            | "CONFLICT"
            | "UNCERTAIN"
            | "REJECTED";

        const confMatch = auditContent.match(/ConfidenceScore:\s*(\d+)/i);
        if (confMatch) result.confidenceScore = parseInt(confMatch[1], 10);

        const priMatch = auditContent.match(/PrimaryReasoning:\s*(.*)/i);
        if (priMatch) result.primaryReasoning = priMatch[1].trim();

        const secMatch = auditContent.match(/SecondaryReasoning:\s*(.*)/i);
        if (secMatch) result.secondaryReasoning = secMatch[1].trim();
      }

      // SOTA 2026: Strip audit tags before parsing to ensure we only look at primary reasoning
      const mainContent = raw
        .replace(/<tribunal_audit>[\s\S]*?<\/tribunal_audit>/g, "")
        .trim();

      const winnerMatch = mainContent.match(
        /WINNER:\s*(?:\[\[)?(.*?)(?:\]\])?\s*\|\s*SCORE:\s*(\d+)%?\s*\|\s*WHY:\s*(.*)/i,
      );
      if (winnerMatch) {
        result.winner = winnerMatch[1].trim();
        result.winnerScore = parseInt(winnerMatch[2]);
        result.winnerWhy = winnerMatch[3].trim();
      }

      const runnerUpMatch = mainContent.match(
        /RUNNERUP:\s*(?:\[\[)?(.*?)(?:\]\])?\s*\|\s*SCORE:\s*(\d+)%?\s*\|\s*WHY:\s*(.*)/i,
      );
      if (runnerUpMatch) {
        result.runnerUp = runnerUpMatch[1].trim();
        result.runnerUpScore = parseInt(runnerUpMatch[2]);
        result.runnerUpWhy = runnerUpMatch[3].trim();
      }

      if (!result.winner) {
        const lines = mainContent.split("\n");
        for (const line of lines) {
          if (line.toUpperCase().includes("WINNER:")) {
            const clean = line
              .replace(/WINNER:/i, "")
              .replace(/[[\]]/g, "")
              .trim();
            result.winner = clean.split("|")[0].trim();
            break;
          }
        }
      }
    } catch (e) {
      HealerLogger.error("Failed to parse reasoning result", e);
    }

    return result;
  }
}
