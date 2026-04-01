import { z } from 'zod';

// --- Sub-Schemas ---

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Exported for external validation and runtime schema reflection.
const SuggestionSchema = z.object({
    id: z.string(),
    type: z.string(), // Usiamo string generica per compatibilità con nuovi tipi
    link: z.string(),
    source: z.string(),
    timestamp: z.number().optional().default(Date.now()),
    category: z.enum(['suggestion', 'error', 'info']).default('suggestion'),
    reasoning: z.unknown().optional(), // Lasciamo unknown per flessibilità struttura result
    meta: z.record(z.string(), z.unknown()).optional(),
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Exported for persistent history monitoring and external audit tools.
const HistoryItemSchema = z.object({
    action: z.string(),
    file: z.string(),
    timestamp: z.number(),
    type: z.string(),
});

const HierarchyDefSchema = z.object({
    up: z.array(z.string()).default([]),
    down: z.array(z.string()).default([]),
    next: z.array(z.string()).default([]),
    prev: z.array(z.string()).default([]),
    same: z.array(z.string()).default([]),
    related: z.array(z.string()).default([]),
});

const CustomRuleSchema = z.object({
    pattern: z.string(),
    property: z.string(),
    maxCount: z.number(),
    severity: z.enum(['error', 'suggestion', 'info']),
});

// --- Main Settings Schema ---

export const SettingsSchema = z.object({
    // Core
    llmApiKey: z.string().default(''),
    secondaryLlmApiKey: z.string().default(''),
    infraNodusApiKey: z.string().default(''),
    llmModelName: z.string().default('gpt-4o'),
    secondaryLlmModelName: z.string().default('claude-3-5-sonnet'),
    llmEndpoint: z.string().default('https://api.openai.com/v1'),
    secondaryLlmEndpoint: z.string().default('https://api.anthropic.com/v1'),
    primaryTimeout: z.number().default(30),
    secondaryTimeout: z.number().default(30),
    aiMaxTokens: z.number().default(1000),
    aiTemperature: z.number().default(0.7),
    aiConfidenceThreshold: z.number().default(70),
    enableAiTribunal: z.boolean().default(false),
    llmMaxRetries: z.number().default(2),
    llmRetryableStatuses: z.array(z.number()).default([429, 408, 503]),
    enableGraphGuardrails: z.boolean().default(true),
    maxNodes: z.number().default(5000),
    maxEdges: z.number().default(50000),
    aliasCacheTtl: z.number().default(300000),
    enableSmartConnections: z.boolean().default(false),
    smartConnectionsLimit: z.number().default(10),
    enableTagHierarchySync: z.boolean().default(true),
    strictDownCheck: z.boolean().default(true),
    scanFolder: z.string().default(''),

    ignoreOrphanNotes: z.boolean().default(false),
    proximityIgnoreList: z.array(z.string()).default([]),
    fullyScannedNotes: z.array(z.string()).default([]),
    detectedModels: z.array(z.string()).default([]),
    secondaryDetectedModels: z.array(z.string()).default([]),
    hierarchies: z.array(HierarchyDefSchema).default([]),
    customTopologyRules: z.array(CustomRuleSchema).default([]),
    lastScanTimestamp: z.number().default(0),
    includeNonMarkdownHubs: z.boolean().default(false),
    impliedSymmetricEdges: z.boolean().default(true),
    impliedTransitiveSiblings: z.boolean().default(true),
    detectTaxonomicSkips: z.boolean().default(true),
    regexExclusionFilter: z.string().default(''),
    enableTemporalAnalysis: z.boolean().default(true),
    enableDynamicOntologyEvolution: z.boolean().default(true),
    mocSaturationThreshold: z.number().default(10),
    aestheticPresetRules: z.string().default('{}'),
    aiPersonaPreset: z.string().default('architect'),
    customAiPersonaPrompt: z.string().default(''),
    enableKarpathyFilter: z.boolean().default(true),
    enableInfraNodus: z.boolean().default(false),
    enableDeepGraphAnalysis: z.boolean().default(false),
    enableRealtimeScanning: z.boolean().default(false),
    requireRelatedReciprocity: z.boolean().default(false),
    allowNextBranching: z.boolean().default(false),
    allowPrevBranching: z.boolean().default(false),
    requireAIBranchValidation: z.boolean().default(false),
    requireAITagValidation: z.boolean().default(true),
    tagPropagationThreshold: z.number().optional().default(0.5),
    tagPropagationExclusions: z.array(z.string()).optional().default(['MOC', 'Index', 'Dashboard']),
    enableSemanticAudit: z.boolean().default(false),

    // Phase 1: Logging & Performance
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    enableFileLogging: z.boolean().default(false),
    logFilePath: z.string().default('SemanticGraphHealer/logs'),
    enableHighMemoryMode: z.boolean().default(false),
    enableDeepTopology: z.boolean().default(false),
    allowMultipleParents: z.boolean().default(false),
    enableVastBridgeScrutiny: z.boolean().default(false),
    bridgeScrutinyMaxDepth: z.number().default(1),
    linkPredictionWeights: z
        .object({
            jaccard: z.number().default(0.35),
            adamicAdar: z.number().default(0.35),
            resourceAllocation: z.number().default(0.3),
        })
        .default({
            jaccard: 0.35,
            adamicAdar: 0.35,
            resourceAllocation: 0.3,
        }),
    cloudModelFallbacks: z
        .array(z.string())
        .default(['gpt-4o', 'claude-3-5-sonnet-latest', 'gemini-1.5-pro', 'deepseek-chat']),
    logBufferSize: z.number().default(1000),
    workerTimeout: z.number().default(120),
});
