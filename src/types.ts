import { App, TFile, type EventRef } from 'obsidian';
import type { MultiGraph } from 'graphology';
export const DASHBOARD_VIEW_TYPE = 'semantic-healer-dashboard';

// --- Internal Obsidian API interfaces ---
export interface ObsidianKeychain {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
}

export interface ObsidianSecretStorage {
    getSecret(key: string): Promise<string | null> | (string | null);
    setSecret(key: string, value: string): Promise<void> | void;
    deleteSecret?(key: string): Promise<void> | void;
    listSecrets?(): Promise<string[]> | string[];
}

export interface ObsidianInternalApp {
    appId?: string;
    settings: SemanticGraphHealerSettings;
    secretStorage?: ObsidianSecretStorage;
    keychain?: ObsidianKeychain;
    plugins: {
        enabledPlugins: Set<string>;
        getPlugin(name: string): ObsidianPlugin | null;
        getPlugin(name: 'datacore'): { api: DatacoreApi } | null;
        getPlugin(name: 'dataview'): { api: DataviewApi } | null;
        getPlugin(name: 'breadcrumbs'): { api: BreadcrumbsApi } | null;
    };
}

export interface ExtendedManifest {
    id: string;
    dir?: string;
    [key: string]: unknown;
}

export interface ObsidianPlugin {
    api?: unknown;
    manifest: ExtendedManifest;
    [key: string]: unknown;
}

export type ExtendedApp = App & ObsidianInternalApp;

declare module 'obsidian' {
    interface Workspace {
        on(name: 'semantic-graph:updated', callback: () => void, ctx?: unknown): EventRef;
    }
}

// --- Dataview / Datacore API interfaces ---
export interface DataArray<T> {
    array(): T[];
    forEach(cb: (v: T) => void): void;
    filter(cb: (v: T) => boolean): DataArray<T>;
    where(cb: (v: T) => boolean): DataArray<T>;
    length: number;
    [index: number]: T;
}

export interface DataviewApi {
    pages(query?: string): DataArray<DataviewPage>;
    page(path: string): DataviewPage | null;
    fileToLinktext(file: TFile, origin: string, omit?: boolean): string;
}

export type BCDirection = 'up' | 'same' | 'down' | 'next' | 'prev';

export interface BreadcrumbsApi {
    DIRECTIONS: readonly BCDirection[];
    mainG: MultiGraph | null;
    closedG: MultiGraph | null;

    getMatrixNeighbours(node: string, dirs: readonly BCDirection[]): Record<BCDirection, unknown> | null;

    getSubInDirs(dirs: readonly BCDirection[], graph?: MultiGraph): MultiGraph;
    getSubForFields(fields: string[], graph?: MultiGraph): MultiGraph;
    refreshIndex(): void;
    dfsAllPaths(start?: string, graph?: MultiGraph): string[][];
    getFieldInfo(field: string): { dir: BCDirection; fieldName: string } | null;
    getFields(dir?: BCDirection): string[];
    getOppDir(dir: BCDirection): BCDirection;
    getOppFields(field: string): string[];
    iterateHiers(callback: (hier: unknown, dir: BCDirection, field: string) => void): void;

    // --- Breadcrumbs Properties ---
    get_neighbours?(node?: string): unknown; // V4 BCAPI exposes get_neighbours returning an EdgeList
    plugin?: {
        settings?: {
            hierarchies?: Array<{
                up?: string[];
                down?: string[];
                same?: string[];
                next?: string[];
                prev?: string[];
            }>;
        };
        graph?: MultiGraph & {
            get_in_edges?(node: string): unknown[];
            hasNode?(node: string): boolean;
        };
    };

    // --- Legacy / Internal ---
    ARROW_DIRECTIONS?: Record<BCDirection, string>;
    buildObsGraph?(): void;
    createIndex?(): void;
}

export interface DataviewPage {
    file: {
        path: string;
        name: string;
        basename: string;
        folder: string;
        ext: string;
        ctime: unknown; // Usually Luxon DateTime
        mtime: unknown;
        size: number;
        tags: string[];
        etags: string[];
        outlinks: DataviewLink[];
        inlinks: DataviewLink[];
        // Essential Link type for backward compatibility
        link: DataviewLink;
        frontmatter?: string[]; // Standard Dataview format: ["key | value", ...]
    };
    [key: string]: unknown;
}

export interface DataviewLink {
    path: string;
    display?: string;
    subpath: string | null;
    embed: boolean;
    type: 'file' | 'header' | 'block';
    withDisplay(d: string): DataviewLink;
    toEmbed(): DataviewLink;
    toObject(): Record<string, unknown>;
    toString(): string;
}

/**
 * Datacore API Interfaces
 */
export interface DatacoreApi {
    page<T extends MarkdownPage = MarkdownPage>(path: string): T | undefined;
    query<T = unknown>(query: string): T[];
    tryQuery<T = unknown>(query: string): { successful: true; value: T[] } | { successful: false; error: string };
    resolvePath(path: string, sourcePath?: string): string;
}

interface InlineField {
    key: string;
    value: unknown;
    raw: string;
    position: { line: number; col: number; offset: number };
}

interface FrontmatterEntry {
    key: string;
    raw: string;
    value: unknown;
}

export interface MarkdownPage {
    $path: string;
    $typename: string;
    $name: string; // Filename without extension
    $extension: string; // Extension
    $ctime: unknown; // luxon DateTime (uses valueOf() for MS)
    $mtime: unknown;
    $size: number;
    $tags: string[];
    $link: DataviewLink; // Native self-link
    $links: DataviewLink[]; // Native outlink objects
    $types: string[]; // Semantic types: ["page", "markdown", etc.]
    $frontmatter?: Record<string, FrontmatterEntry>;
    $infields: Record<string, InlineField>; // Metadata objects, extraction via value()
    value(field: string): unknown; // Idiomatic API for field extraction (final values)
    field?(field: string): InlineField | undefined; // Optional access to metadata objects
    [key: string]: unknown; // Custom fields
}

/**
 * Notifier service abstraction for headless/silent operation.
 */
export interface HealerNotifier {
    show(message: string, type?: 'info' | 'error' | 'warning'): void;
}

/**
 * Programmatic API surface for headless/CLI automation.
 */
export interface HealerAutomationApi {
    runAnalysis(options: { silent: boolean }): Promise<Suggestion[]>;
    getSuggestions(): Suggestion[];
    getMetrics(): TopologicalMetrics | null;
    executeBatch(options: { confidence: number; category?: string }): Promise<{
        success: boolean;
        batchId: string;
        appliedCount: number;
        failedCount: number;
    }>;
    undoBatch(batchId: string): Promise<{
        success: boolean;
        revertedCount: number;
        failedCount: number;
    }>;
}

// --- Plugin Core Types ---
/**
 * Types of suggestions generated by the engine.
 */
export type SuggestionType =
    | 'ai'
    | 'deterministic'
    | 'quality'
    | 'incongruence'
    | 'infra'
    | 'semantic'
    | 'hybrid'
    | 'topology_gap'
    | 'semantic_inference';

export interface TopologicalMetrics {
    pageRank: Record<string, number>;
    betweenness: Record<string, number>;
    communities: Record<string, number>;
    lastAnalysisTimestamp: number;
    graphVersion: string;
}

interface SuggestionMeta {
    property?: string; // Logical type: 'up', 'down', 'next', 'prev', 'same'
    propertyKey?: string; // Actual YAML key: 'parent', 'right', 'procedural-next', etc.
    sourcePath?: string; // Canonical TFile.path for logic
    targetPath?: string; // Canonical TFile.path for logic
    targetPaths?: string[]; // Multiple target paths for branch validation
    sourceNote?: string; // Basename for display
    targetNote?: string; // Basename for display
    targetNotes?: string[]; // Multiple target notes for branch validation
    description?: string;
    confidence?: number;
    winner?: string;
    losers?: string[];
    competingValues?: string[];
}

export interface ReasoningResult {
    winner: string | null;
    winnerScore: number;
    winnerWhy: string;
    runnerUp: string | null;
    runnerUpScore: number;
    runnerUpWhy: string;
    rawResponse: string;
    verdict?: 'STABLE' | 'CONFLICT' | 'UNCERTAIN' | 'REJECTED';
    confidenceScore?: number;
    primaryReasoning?: string;
    secondaryReasoning?: string;
}

export interface Suggestion {
    id: string;
    type: SuggestionType;
    category: 'error' | 'suggestion' | 'info';
    link: string;
    source: string;
    timestamp: number;
    reasoning?: ReasoningResult;
    meta?: SuggestionMeta & Record<string, unknown>;
    isVerifying?: boolean;
    verificationResult?: string;
}

export interface HistoryItem {
    timestamp: number;
    action: string;
    file: string;
    type: string;
    mementoData?: Array<{
        path: string;
        property: string;
        originalValue: unknown;
    }>;
    batchId?: string;
}

export interface InfraGap {
    cluster_a?: string;
    cluster_b?: string;
    node1?: string;
    node2?: string;
    advice?: string | Record<string, unknown>;
    bridging_text?: string;
}

export interface SemanticGraphHealerSettings {
    llmApiKey: string;
    secondaryLlmApiKey: string;
    infraNodusApiKey: string;
    llmModelName: string;
    secondaryLlmModelName: string;
    primaryModel: string;
    secondaryModel: string;
    safeZoneThreshold: number;
    htrStructuralWeight: number;
    llmEndpoint: string;
    secondaryLlmEndpoint: string;
    primaryTimeout: number;
    secondaryTimeout: number;
    aiMaxTokens: number;
    aiTemperature: number;
    aiConfidenceThreshold: number;
    enableAiTribunal: boolean;
    llmMaxRetries: number;
    llmRetryableStatuses: number[];
    enableGraphGuardrails: boolean;
    maxNodes: number;
    maxEdges: number;
    aliasCacheTtl: number;
    pageChildrenCacheMaxSize?: number; // Max entries in Datacore pageChildrenCache (default 500)
    enableSmartConnections: boolean;
    smartConnectionsLimit: number;
    smartConnectionsAjsonSizeCap: number; // Max size of AJSON files to parse in fallback (bytes)
    enableTagHierarchySync: boolean;
    strictDownCheck: boolean;
    scanFolder: string;

    ignoreOrphanNotes: boolean;
    proximityIgnoreList: string[];
    fullyScannedNotes: string[];
    detectedModels: string[];
    secondaryDetectedModels: string[];
    hierarchies: Array<{
        up: string[];
        down: string[];
        next: string[];
        prev: string[];
        same: string[];
        related: string[];
    }>;
    customTopologyRules: Array<{
        pattern: string;
        property: string;
        maxCount: number;
        severity: 'error' | 'suggestion' | 'info';
    }>;
    lastScanTimestamp: number;
    includeNonMarkdownHubs: boolean;
    impliedSymmetricEdges: boolean;
    impliedTransitiveSiblings: boolean;
    detectTaxonomicSkips: boolean;
    regexExclusionFilter: string;
    enableTemporalAnalysis: boolean;
    enableDynamicOntologyEvolution: boolean;
    mocSaturationThreshold: number;
    aestheticPresetRules: string;
    aiPersonaPreset: string;
    customAiPersonaPrompt: string;
    enableKarpathyFilter: boolean;
    enableInfraNodus: boolean;
    enableDeepGraphAnalysis: boolean;
    enableRealtimeScanning: boolean;
    requireRelatedReciprocity: boolean;
    allowNextBranching: boolean;
    allowPrevBranching: boolean;
    requireAIBranchValidation: boolean;
    requireAITagValidation: boolean;
    tagPropagationThreshold?: number;
    tagPropagationExclusions?: string[];
    enableSemanticAudit: boolean;
    graphRagIndexDir: string;
    // Logging & Performance
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    enableFileLogging: boolean;
    logFilePath: string;
    enableHighMemoryMode: boolean;
    enableDeepTopology: boolean;
    allowMultipleParents: boolean;
    enableVastBridgeScrutiny: boolean;
    bridgeScrutinyMaxDepth: number;
    linkPredictionWeights: {
        jaccard: number;
        adamicAdar: number;
        resourceAllocation: number;
    };
    cloudModelFallbacks: string[];
    logBufferSize: number;
    workerTimeout: number;

    // Adaptive Performance (Wave 2)
    enableSafetyMode: boolean;
    safetyModeThresholdDesktop: number;
    safetyModeThresholdMobile: number;
    performanceMode?: 'Standard' | 'Safety'; // Runtime state

    // Phase 5: Topological Diagnostics
    ouroborosScope: 'universal' | 'boundary';
    blackHoleThreshold: number;

    // Phase 15: Embeddings
    embeddingProvider: 'ollama' | 'localai' | 'openai';
    embeddingModel: string;
    embeddingEndpoint: string;
    embeddingDimensions: number;

    // Keychain Migration
    keychainMigrationComplete: boolean;
    keychainCorrupted: boolean;
    sghealerMasterKeyJWK?: string;

    // Encrypted Keys
    openaiLlmApiKeyEncrypted?: string;
    anthropicLlmApiKeyEncrypted?: string;
    deepseekLlmApiKeyEncrypted?: string;
    infranodusLlmApiKeyEncrypted?: string;
    customLlmApiKeyEncrypted?: string;
}

export type SettingsPreset = 'balanced' | 'privacy' | 'ai-maximal' | 'performance';

export interface RelatedNote {
    path: string;
    score: number;
    link: string;
}

/**
 * Worker Communication Types
 */
export type WorkerActionType =
    | 'PAGERANK'
    | 'COMMUNITY'
    | 'BETWEENNESS'
    | 'FULL_ANALYSIS'
    | 'SIMILARITY'
    | 'COCITATION'
    | 'TOPOLOGY_DIAGNOSTICS';

export interface WorkerNode {
    key: string;
    attributes: Record<string, unknown>;
}

export interface WorkerEdge {
    source: string;
    target: string;
    attributes: Record<string, unknown>;
}

export interface WorkerPayload {
    nodes: WorkerNode[];
    edges: WorkerEdge[];
    requestId: string;
}

export type GraphAnalysisResult =
    | Record<string, number>
    | Array<{ source: string; target: string; score: number }>
    | Array<{ a: string; b: string; score: number }>
    | {
          pageRank: Record<string, number>;
          communities: Record<string, number>;
          betweenness: Record<string, number> | null;
          nodeCount: number;
          edgeCount: number;
      }
    | {
          bridges: Array<{ source: string; target: string; via: string; type: string }>;
          blackHoles: Array<{ path: string; inDegree: number }>;
          cycles: Array<{ path: string[]; type: string }>;
      };

interface WorkerOptions {
    limit?: number;
    minScore?: number;
    weights?: {
        jaccard: number;
        adamicAdar: number;
        resourceAllocation: number;
    };
    fileStats?: Record<string, { mtime: number }>;
    edgePolicy?: 'strict' | 'tolerant';
    maxEdges?: number;
    maxNodes?: number;
    blackHoleThreshold?: number;
    [key: string]: unknown;
}

export interface WorkerMessage {
    type: WorkerActionType;
    payload: WorkerPayload;
    options?: WorkerOptions;
}

interface WorkerResponseResult {
    type: 'RESULT';
    payload: {
        requestId: string;
        data: GraphAnalysisResult;
    };
}

interface WorkerResponseError {
    type: 'ERROR';
    payload: {
        requestId: string;
        message: string;
    };
}

interface WorkerResponseProgress {
    type: 'PROGRESS';
    payload: {
        requestId: string;
        data: {
            pct: number;
            message: string;
        };
    };
}

export type WorkerResponse = WorkerResponseResult | WorkerResponseError | WorkerResponseProgress;

export interface HierarchyNode {
    parents: string[];
    children: string[];
    siblings: string[];
    next: string[];
    prev: string[];
}

/**
 * Force-graph compatible data structures
 */
export interface ForceGraphNode {
    id: string;
    label?: string;
    color?: string;
    isCycle?: boolean;
    [key: string]: unknown;
}

export interface ForceGraphLink {
    source: string | ForceGraphNode;
    target: string | ForceGraphNode;
    isGhost?: boolean;
    [key: string]: unknown;
}

export interface ForceGraphData {
    nodes: ForceGraphNode[];
    links: ForceGraphLink[];
}

export const DEFAULT_SETTINGS: SemanticGraphHealerSettings = {
    llmApiKey: '',
    secondaryLlmApiKey: '',
    infraNodusApiKey: '',
    llmModelName: 'gpt-4o',
    secondaryLlmModelName: 'claude-3-5-sonnet',
    primaryModel: 'gpt-4o',
    secondaryModel: 'claude-3-5-sonnet',
    safeZoneThreshold: 80,
    htrStructuralWeight: 0.6,
    llmEndpoint: 'https://api.openai.com/v1',
    secondaryLlmEndpoint: 'https://api.anthropic.com/v1',
    primaryTimeout: 30,
    secondaryTimeout: 30,
    aiMaxTokens: 1000,
    aiTemperature: 0.7,
    aiConfidenceThreshold: 70,
    enableAiTribunal: false,
    llmMaxRetries: 2,
    llmRetryableStatuses: [429, 408, 503],
    enableGraphGuardrails: true,
    maxNodes: 5000,
    maxEdges: 50000,
    aliasCacheTtl: 300000,
    pageChildrenCacheMaxSize: 500,
    enableSmartConnections: false,
    smartConnectionsLimit: 10,
    smartConnectionsAjsonSizeCap: 1024 * 1024, // 1MB
    enableTagHierarchySync: true,
    strictDownCheck: true,
    scanFolder: '',
    ignoreOrphanNotes: false,
    proximityIgnoreList: [],
    fullyScannedNotes: [],
    detectedModels: [],
    secondaryDetectedModels: [],
    hierarchies: [
        {
            up: ['up', 'parent'],
            down: ['down', 'child'],
            next: ['next'],
            prev: ['prev'],
            same: ['same', 'sibling'],
            related: ['related', 'mentions', 'see-also'],
        },
    ],
    customTopologyRules: [],
    lastScanTimestamp: 0,
    includeNonMarkdownHubs: false,
    impliedSymmetricEdges: true,
    impliedTransitiveSiblings: true,
    detectTaxonomicSkips: true,
    regexExclusionFilter: '',
    enableTemporalAnalysis: true,
    enableDynamicOntologyEvolution: true,
    mocSaturationThreshold: 10,
    aestheticPresetRules: '{}',
    aiPersonaPreset: 'architect',
    customAiPersonaPrompt: '',
    enableKarpathyFilter: true,
    enableInfraNodus: false,
    enableDeepGraphAnalysis: false,
    enableRealtimeScanning: false,
    requireRelatedReciprocity: false,
    allowNextBranching: false,
    allowPrevBranching: false,
    requireAIBranchValidation: false,
    requireAITagValidation: true,
    tagPropagationThreshold: 0.5,
    tagPropagationExclusions: ['MOC', 'Index', 'Dashboard'],
    enableSemanticAudit: false,
    graphRagIndexDir: '.planning/index',
    logLevel: 'info',
    enableFileLogging: false,
    logFilePath: 'SemanticGraphHealer/logs',
    enableHighMemoryMode: false,
    enableDeepTopology: false,
    allowMultipleParents: false,
    enableVastBridgeScrutiny: false,
    bridgeScrutinyMaxDepth: 1,
    linkPredictionWeights: {
        jaccard: 0.35,
        adamicAdar: 0.35,
        resourceAllocation: 0.3,
    },
    cloudModelFallbacks: ['gpt-4o', 'claude-3-5-sonnet-latest', 'gemini-1.5-pro', 'deepseek-chat'],
    logBufferSize: 1000,
    workerTimeout: 120,
    enableSafetyMode: false,
    safetyModeThresholdDesktop: 10000,
    safetyModeThresholdMobile: 2500,
    performanceMode: 'Standard',
    ouroborosScope: 'universal',
    blackHoleThreshold: 7,
    embeddingProvider: 'ollama',
    embeddingModel: 'nomic-embed-text',
    embeddingEndpoint: 'http://localhost:11434',
    embeddingDimensions: 768,
    keychainMigrationComplete: false,
    keychainCorrupted: false,
};
