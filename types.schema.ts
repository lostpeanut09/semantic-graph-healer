import { z } from 'zod';

// --- Sub-Schemas ---

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
    scanFolder: z.string().default(''),
    autoFixMundaneLinks: z.boolean().default(false),
    ignoreOrphanNotes: z.boolean().default(false),
    includeNonMarkdownHubs: z.boolean().default(false), // New v1.1
    fullyScannedNotes: z.array(z.string()).default([]),
    lastScanTimestamp: z.number().default(0),

    // Integrations
    enableSmartConnections: z.boolean().default(false),
    smartConnectionsLimit: z.number().default(10),
    enableInfraNodus: z.boolean().default(false), // New
    infraNodusApiKey: z.string().default(''),

    // Hierarchies & Topology
    hierarchies: z.array(HierarchyDefSchema).default([]),
    strictDownCheck: z.boolean().default(true),
    customTopologyRules: z.array(CustomRuleSchema).default([]),
    enableTagHierarchySync: z.boolean().default(true),

    // Rules (Advanced Logic)
    impliedSymmetricEdges: z.boolean().default(true),
    impliedTransitiveSiblings: z.boolean().default(true),
    detectTaxonomicSkips: z.boolean().default(true),
    regexExclusionFilter: z.string().default(''),

    // Deep Analytics (New v1.1)
    enableDeepGraphAnalysis: z.boolean().default(false),
    enableRealtimeScanning: z.boolean().default(false),

    // LLM / AI
    llmEndpoint: z.string().default('https://api.openai.com/v1'),
    llmApiKey: z.string().default(''),
    llmModelName: z.string().default('gpt-4o'),

    enableAiTribunal: z.boolean().default(false),
    secondaryLlmEndpoint: z.string().default('https://api.anthropic.com/v1'),
    secondaryLlmApiKey: z.string().default(''),
    secondaryLlmModelName: z.string().default('claude-3-5-sonnet'),

    detectedModels: z.array(z.string()).default([]),
    secondaryDetectedModels: z.array(z.string()).default([]),

    aiConfidenceThreshold: z.number().default(70),
    aiMaxTokens: z.number().default(1000),
    aiTemperature: z.number().default(0.7),
    primaryTimeout: z.number().default(30),
    secondaryTimeout: z.number().default(30),
    llmMaxRetries: z.number().default(2),
    llmRetryableStatuses: z.array(z.number()).default([429, 408, 503]),

    // Performance & Guardrails
    enableGraphGuardrails: z.boolean().default(true),
    maxNodes: z.number().default(5000),
    maxEdges: z.number().default(50000),
    aliasCacheTtl: z.number().default(300000),

    // Intelligent Evolution / Persona
    enableTemporalAnalysis: z.boolean().default(true),
    enableDynamicOntologyEvolution: z.boolean().default(true),
    mocSaturationThreshold: z.number().default(10),
    aestheticPresetRules: z.string().default('{}'),
    aiPersonaPreset: z.string().default('architect'),
    customAiPersonaPrompt: z.string().default(''),
    enableKarpathyFilter: z.boolean().default(true),

    // State
    pendingSuggestions: z.array(SuggestionSchema).default([]),
    history: z.array(HistoryItemSchema).default([]),
    proximityIgnoreList: z.array(z.string()).default([]),
});
