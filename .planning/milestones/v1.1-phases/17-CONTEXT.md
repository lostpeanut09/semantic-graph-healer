# Phase 17: Obsidian CLI Integration & Automation

## Objective

Enable deep automation and "headless" interaction with the Semantic Graph Healer via the Obsidian CLI (v1.12+), allowing for programmatic analysis, reporting, and repair execution.

## Decisions

### 1. Programmatic API Surface

- The plugin will expose a public `api` object on its main class instance.
- **Bridge:** Programmatic access will primarily use `obsidian eval code="..."`.
- **Methods:**
    - `runAnalysis(options)`: Trigger silent/verbose scans. Returns completion status.
    - `getSuggestions()`: Returns the full JSON array of pending suggestions.
    - `getMetrics()`: Returns graph health, centrality, and community density data.
    - `executeFix(id)`: Executes a single suggestion by ID.
    - `executeBatch(options)`: Applies multiple fixes based on confidence thresholds or categories.

### 2. Reporting & Output

- **Format:** Standardize on **Pure JSON** for all CLI-optimized output.
- **Piping:** Ensure output is clean (no UI Notices or non-JSON logs) when triggered via CLI commands to facilitate `jq` processing.

### 3. Command Registration

- Register specific "Automation" commands in Obsidian:
    - `export-suggestions-json`: Prints current cache to console.
    - `export-metrics-json`: Prints graph metrics to console.
    - `apply-fixes-batch`: CLI-safe batch execution.

### 4. Safety & Headless Execution

- **Mementos:** ALL repairs triggered via CLI/API **MUST** create a `HistoryItem` with a `mementoData` payload.
- **Undo Path:** Programmatic repairs must be reversible via the Dashboard UI using the existing `SuggestionExecutor.undo()` logic.
- **Confidence Gate:** Batch repairs via CLI will default to a 90% confidence threshold unless overridden.

## Success Criteria

- Users can run `obsidian eval` to extract all pending graph issues as JSON.
- Analysis can be triggered and awaited from a terminal script.
- Batch repairs can be executed headlessly with a full audit trail (Mementos) preserved in the history.
- No regressions in UI stability when programmatic commands are running.

## Downstream Guidance

- **Researcher:** Verify how `obsidian eval` handles `Promise` returns and how to best capture standard output for clean JSON piping.
- **Planner:** Focus on exposing existing core logic (TopologyAnalyzer, SuggestionExecutor) through the new API layer without breaking existing encapsulation.
