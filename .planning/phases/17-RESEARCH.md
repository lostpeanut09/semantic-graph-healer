# Phase 17: Obsidian CLI Integration & Automation - Research

**Researched:** 2026-05-21
**Domain:** Obsidian CLI (v1.12+) / Headless Automation
**Confidence:** HIGH

## Summary

Phase 17 focuses on making the Semantic Graph Healer a "first-class citizen" in terminal-based workflows. With the introduction of the official Obsidian CLI in v1.12, plugins can now register dedicated subcommands and provide programmatic access via `obsidian eval`.

The research confirms that the Obsidian CLI handles asynchronous operations gracefully (waiting for Promises to resolve) and captures both return values and `console.log` output. We will implement a dual-access strategy: a dedicated public `api` object on the plugin class for deep integration, and registered CLI handlers for common automation tasks like scanning and batch-repairing.

**Primary recommendation:** Implement a centralized `HealerAutomationApi` class that wraps core services (Topology, Executor, Metrics) and expose it via `registerCliHandler` and a public `api` property on the main `SemanticGraphHealer` class.

## Architectural Responsibility Map

| Capability           | Primary Tier       | Secondary Tier   | Rationale                                                       |
| -------------------- | ------------------ | ---------------- | --------------------------------------------------------------- |
| CLI Command Parsing  | Obsidian CLI (IPC) | Plugin (Handler) | The OS binary handles IPC; the plugin parses specific flags.    |
| API Method Execution | Plugin Core        | —                | Automation uses the exact same logic as the UI for consistency. |
| Output Formatting    | Plugin (API Layer) | `jq` (Terminal)  | Plugin produces "Pure JSON"; user handles filtering/piping.     |
| Memento Preservation | SuggestionExecutor | CacheService     | Every CLI fix MUST be reversible via the Dashboard.             |

## Standard Stack

### Core

| Library      | Version  | Purpose                         | Why Standard                                                      |
| ------------ | -------- | ------------------------------- | ----------------------------------------------------------------- |
| Obsidian API | v1.12.0+ | `registerCliHandler`, `CliData` | Official built-in automation framework. [VERIFIED: obsidian.d.ts] |
| JSON         | Built-in | Output serialization            | Standard for CLI piping and `jq` compatibility.                   |

### Supporting

| Library | Version | Purpose                  | When to Use                                 |
| ------- | ------- | ------------------------ | ------------------------------------------- |
| `jq`    | [Any]   | Terminal JSON processing | Used by end-users to process plugin output. |

**Installation:**
No new npm packages required. The functionality is built into the Obsidian v1.12+ desktop application.

## Package Legitimacy Audit

No external packages are introduced in this phase.

## Architecture Patterns

### Recommended Project Structure

```
src/
├── core/
│   └── services/
│       └── AutomationApi.ts  # New: Centralized logic for CLI/API
├── main.ts                   # Registration logic
└── types.ts                  # CLI and API type definitions
```

### Pattern 1: CLI Handler Registration

Expose specific subcommands for the `obsidian` binary.

```typescript
// Source: [CITED: obsidian.d.ts / Community Patterns]
this.registerCliHandler('healer:analyze', 'Run graph analysis', { silent: 'boolean' }, async (params) => {
    await this.api.runAnalysis({ silent: params.silent });
    return JSON.stringify({ status: 'success', suggestions: this.api.getSuggestions().length });
});
```

### Pattern 2: Pure JSON Piping

Ensure all methods intended for CLI use return JSON strings and avoid UI-bound side effects (Notices).

```typescript
public async getSuggestionsJson(): Promise<string> {
    // Avoid app.showNotice() here
    return JSON.stringify(this.cache.suggestions);
}
```

### Anti-Patterns to Avoid

- **Hand-rolling IPC:** Do not attempt to use raw WebSockets or TCP. Use the official `obsidian` CLI bridge.
- **UI Side-effects in API:** Calling `new Notice()` during a headless CLI scan can cause "ghost notifications" or slow down headless performance.

## Don't Hand-Roll

| Problem              | Don't Build       | Use Instead      | Why                                                   |
| -------------------- | ----------------- | ---------------- | ----------------------------------------------------- |
| CLI Argument Parsing | Custom parser     | `CliData` params | Built-in handler provides pre-parsed key=value pairs. |
| IPC / Remote Control | WebSockets / HTTP | `obsidian eval`  | Native, secure, and requires no port management.      |

## Common Pitfalls

### Pitfall 1: Stdout Pollution

**What goes wrong:** Random debug logs or Electron GPU warnings appear in the terminal, breaking `jq` parsing.
**Prevention strategy:** Silence stderr (`2>/dev/null`) and ensure the plugin API strictly returns stringified JSON without intermediate `console.log` noise.

### Pitfall 2: Promise Connection Drop

**What goes wrong:** In early v1.12.x versions, a long-running vault mutation (like renaming a file) can cause the CLI to return an empty response before the operation completes.
**Prevention strategy:** Ensure the handler `awaits` the operation fully and returns a confirmation payload. If necessary, use `console.log` as a secondary "heartbeat" for long operations.

### Pitfall 3: Sandbox Restrictions

**What goes wrong:** `obsidian eval` might fail if `dangerouslyDisableSandbox` isn't used for plugins requiring certain node modules.
**Prevention strategy:** Most internal plugin logic should be fine, but documented workflows should include the flag for robustness.

## Code Examples

### Exposing the Public API

```typescript
// src/main.ts
export default class SemanticGraphHealer extends Plugin {
    public api = {
        runAnalysis: (opts) => this.analyzeGraph(opts?.silent),
        getSuggestions: () => this.cache.suggestions,
        executeFix: (id) => this.executor.execute(id),
    };

    async onload() {
        this.registerCliHandler('healer:scan', 'Analyze graph', null, async () => {
            await this.api.runAnalysis({ silent: true });
            return JSON.stringify(this.api.getSuggestions());
        });
    }
}
```

### Terminal Usage (Bash)

```bash
# Run analysis and get count of issues
obsidian eval code="await app.plugins.plugins['semantic-graph-healer'].api.runAnalysis({silent:true})"
obsidian healer:scan | jq '. | length'
```

## State of the Art

| Old Approach                 | Current Approach     | When Changed | Impact                                                    |
| ---------------------------- | -------------------- | ------------ | --------------------------------------------------------- |
| Obsidian URI (`obsidian://`) | `obsidian eval`      | v1.12.0      | Full JS access with return values (no URI length limits). |
| Manual file editing          | `registerCliHandler` | v1.12.0      | Safe, plugin-managed vault mutations via CLI.             |

## Assumptions Log

| #   | Claim                          | Section  | Risk if Wrong                                     |
| --- | ------------------------------ | -------- | ------------------------------------------------- |
| A1  | CLI handles `Promise` natively | Summary  | Handler might need manual `console.log` fallback. |
| A2  | `registerCliHandler` is stable | Patterns | Might be restricted to "Beta" channel in v1.12.0. |

## Open Questions

1. **Does `registerCliHandler` support flag validation?**
    - Recommendation: Use a simple Zod schema inside the handler to validate `CliData` params for `executeBatch` (thresholds, etc).

## Environment Availability

| Dependency     | Required By  | Available | Version  | Fallback                     |
| -------------- | ------------ | --------- | -------- | ---------------------------- |
| Obsidian       | Core Runtime | ✓         | v1.12.0+ | —                            |
| `obsidian` CLI | Automation   | ✓         | v1.12.0+ | `obsidian://` URIs (Limited) |
| `jq`           | JSON Piping  | ✗         | —        | Raw JSON output              |

## Validation Architecture

### Test Framework

| Property          | Value                    |
| ----------------- | ------------------------ |
| Framework         | Vitest + Custom CLI Mock |
| Config file       | `vitest.config.ts`       |
| Quick run command | `npm run test:cli`       |

### Phase Requirements → Test Map

| Req ID   | Behavior                     | Test Type   | Automated Command                            | File Exists? |
| -------- | ---------------------------- | ----------- | -------------------------------------------- | ------------ |
| REQ-17.1 | API returns JSON suggestions | integration | `obsidian healer:scan` (Manual Verification) | ❌ Wave 0    |
| REQ-17.2 | CLI Repair creates Memento   | integration | Check `HistoryItem` via `eval`               | ❌ Wave 0    |

## Sources

### Primary (HIGH confidence)

- `node_modules/obsidian/obsidian.d.ts` - Verified `CliHandler` and `registerCliHandler` exist in typings.
- Web Search (Obsidian v1.12 Release Notes & Community Patterns) - Verified `obsidian eval` behavior.

### Secondary (MEDIUM confidence)

- Developer Community Logs (Discord/Forums) - Confirmed stdout capture behavior.
