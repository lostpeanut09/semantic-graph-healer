<!-- generated-by: gsd-doc-writer -->

# API Reference

This document describes the public and internal API surfaces of the Semantic Graph Healer plugin. It covers programmatic automation, external protocol handlers, CLI integration, and the internal core interfaces used for system extension.

## Authentication & Key Management

The plugin interacts with external AI services (OpenAI, Anthropic, DeepSeek, InfraNodus). API keys are never stored in plain text if secure storage is available.

- **Storage**: Uses Obsidian's `SecretStorage` or `Keychain` API when available (Obsidian v1.x+).
- **Migration**: On first run, keys from `data.json` are automatically migrated to secure storage and redacted from the settings file.
- **Programmatic Access**: Internal services access keys via the `KeychainService.getApiKey(type)` method.
- **Encryption**: If secure storage is unavailable, fallback keys are encrypted locally using AES-256-GCM (via the Web Crypto API) with PBKDF2 key derivation.

## External Endpoints (URI & CLI)

The plugin exposes functionality to external tools and Obsidian's internal shell via URI protocols and CLI handlers.

### Obsidian Protocol Handlers

These can be triggered via `obsidian://healer?...` or `obsidian://healer-action?...` URLs.

| Action        | Parameters                                | Description                                      |
| :------------ | :---------------------------------------- | :----------------------------------------------- |
| `scan`        | None                                      | Triggers a full semantic graph analysis.         |
| `apply-batch` | `confidence` (float), `category` (string) | Applies repairs matching the threshold/category. |
| `undo-batch`  | `batchId` (string)                        | Reverts a specific batch of repairs.             |

### CLI Handlers

Available if the user has a CLI-compatible Obsidian environment.

| Command                     | Description                             | Return Format                |
| :-------------------------- | :-------------------------------------- | :--------------------------- |
| `healer:scan`               | Runs a silent graph analysis.           | JSON (Array of `Suggestion`) |
| `healer:export-suggestions` | Exports current cached suggestions.     | JSON (Array of `Suggestion`) |
| `healer:apply-batch`        | Applies repairs by confidence/category. | JSON (Batch result object)   |
| `healer:undo-batch`         | Undoes a specific repair batch.         | JSON (Undo result object)    |

## Programmatic Automation API

Other plugins or scripts can access the `AutomationApi` instance exposed on the main plugin object (`app.plugins.plugins['semantic-graph-healer'].api`).

### `HealerAutomationApi` Interface

```typescript
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
```

## Internal Core Interfaces (Ports)

The plugin follows a Hexagonal Architecture (Ports & Adapters). Core logic depends on these interfaces rather than concrete implementations.

### Adapter Contracts (`src/core/ports/`)

| Interface               | Purpose                      | Implementation                        |
| :---------------------- | :--------------------------- | :------------------------------------ |
| `IDataviewPort`         | Vault-wide metadata queries. | `DataviewAdapter` / `DatacoreAdapter` |
| `IBreadcrumbsPort`      | Hierarchical topology data.  | `BreadcrumbsAdapter`                  |
| `ISmartConnectionsPort` | Semantic similarity data.    | `SmartConnectionsAdapter`             |

### `IDataviewPort` Signature

```typescript
export interface IDataviewPort {
    getPage(path: string): DataviewPage | null;
    invalidateBacklinkIndex(): void;
    queryPages(query: string): Promise<DataviewPage[]>;
    getPages(query: string): DataviewPage[];
    getBacklinks(path: string): string[];
    getDataviewApi(): DataviewApi | null;
    invalidate(path?: string): void;
    destroy?(): void;
}
```

### `IBreadcrumbsPort` Signature

```typescript
export interface IBreadcrumbsPort {
    getHierarchy(path: string): Promise<HierarchyNode | null>;
    invalidate(path?: string): void;
    destroy?(): void;
}
```

### `ISmartConnectionsPort` Signature

```typescript
export interface ISmartConnectionsPort {
    getRelatedNotes(path: string, limit: number): Promise<RelatedNote[]>;
    invalidate(path?: string): void;
    destroy?(): void;
}
```

## Data Models

### `Suggestion` Object

The primary unit of work for the healing engine.

```json
{
    "id": "ai_8f2d1a...",
    "type": "ai",
    "category": "suggestion",
    "link": "[[Target Note]]",
    "source": "Source context or reason",
    "timestamp": 1716395200000,
    "reasoning": {
        "winner": "[[Target Note]]",
        "winnerScore": 0.85,
        "winnerWhy": "Strong contextual alignment."
    },
    "meta": {
        "property": "up",
        "sourcePath": "notes/active.md",
        "targetPath": "notes/parent.md",
        "confidence": 85
    }
}
```

### `TopologicalMetrics`

Calculated during deep graph analysis.

```json
{
    "pageRank": { "path/to/note.md": 0.045 },
    "communities": { "path/to/note.md": 2 },
    "betweenness": { "path/to/note.md": 12.5 },
    "lastAnalysisTimestamp": 1716395200000,
    "graphVersion": "v1"
}
```

## Error Handling & Rate Limits

- **LLM Rate Limits**: Configurable via `llmMaxRetries` and `llmRetryableStatuses` (default: 429, 408, 503).
- **Timeouts**: Primary and secondary LLM timeouts are configurable in settings (default 30s).
- **Logging**: The plugin uses `HealerLogger` which buffers logs and can write to a file in the vault.
- **Fail-Safe**: If a critical dependency (e.g., Datacore) is missing, the plugin enters a degraded mode with limited analysis capabilities.
