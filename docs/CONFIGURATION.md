# Configuration Guide

The Semantic Graph Healer provides extensive configuration through Obsidian's Settings view. These are grouped into modular sections defined in `src/views/sections/`.

## Key Configuration Categories

- **Core Settings:** Global plugin behavior.
- **Primary Model Settings:** Configuration for the LLM backend (e.g., GPT-4, Claude).
- **Security & API Keys:** Secure storage for third-party services using `KeychainService`.
- **Performance & Safety:** Thresholds for `PerformanceService` to throttle graph analysis.
- **Adapters:** Enable/disable imports from Dataview, Breadcrumbs, and Smart Connections.
- **Logging:** Configure the detail level of the `HealerLogger`.

## Advanced Settings

- **Intelligent Evolution:** Rules for automated graph structural updates.
- **Hierarchies:** Define expected knowledge structures for automatic propagation.
- **Blacklist:** Files or tags to ignore during graph healing.

## Environment Variables

As an Obsidian plugin, Semantic Graph Healer does not use standard environment variables (e.g., `.env` files). All configuration is managed through the Obsidian settings UI and persisted locally.

## Config File Format

The plugin stores its configuration in a `data.json` file located in the plugin's root directory (`.obsidian/plugins/semantic-graph-healer/data.json`). The structure follows the `SettingsSchema` defined in `src/types.schema.ts`.

Example `data.json` format:

```json
{
    "llmModelName": "gpt-4o",
    "aiMaxTokens": 1000,
    "enableSmartConnections": false,
    "hierarchies": [
        {
            "up": ["parent", "broader"],
            "down": ["child", "narrower"],
            "next": ["next"],
            "prev": ["prev"],
            "same": ["sibling"],
            "related": ["related"]
        }
    ],
    "safetyModeThresholdDesktop": 10000,
    "safetyModeThresholdMobile": 2500
}
```

Sensitive data like API keys are migrated to Obsidian's secure storage if available (`openaiLlmApiKeyEncrypted`, etc.).

## Required vs Optional Settings

Because Semantic Graph Healer operates within Obsidian, all settings have sensible defaults and will not cause a "startup failure" if omitted from `data.json`. However, certain settings are functionally required for specific features:

- **Required for AI features:** At least one API key (e.g., `llmApiKey` or `secondaryLlmApiKey`) or a local embedding configuration.
- **Required for InfraNodus integration:** `infraNodusApiKey`.

If a configuration is malformed during load, the plugin uses `Zod` validation to fall back to safe defaults, preventing data loss.

## Defaults

Key default values as defined in `src/types.schema.ts`:

| Setting             | Default Value | Description                                |
| ------------------- | ------------- | ------------------------------------------ |
| `llmModelName`      | `gpt-4o`      | Primary LLM model.                         |
| `primaryTimeout`    | `30`          | Timeout in seconds for AI requests.        |
| `aiTemperature`     | `0.7`         | Temperature for LLM sampling.              |
| `maxNodes`          | `5000`        | Maximum number of nodes to render/process. |
| `logLevel`          | `info`        | Detail level of the HealerLogger.          |
| `embeddingProvider` | `ollama`      | Default embedding service provider.        |

## Per-Environment Overrides

Settings are generally synced verbatim across devices via Obsidian Sync or other sync solutions. However, the plugin implements platform-aware configurations to handle device constraints automatically:

- `safetyModeThresholdDesktop` (default `10000`): Maximum nodes/edges before enabling safety mode on desktop.
- `safetyModeThresholdMobile` (default `2500`): Lower threshold for mobile devices to prevent out-of-memory crashes.

These thresholds allow the `PerformanceService` to throttle graph analysis dynamically based on the current environment.
