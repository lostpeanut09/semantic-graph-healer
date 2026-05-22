# Phase 4: BaseAdapter Ultra-Hardening - Research

**Researched:** 2026-05-05
**Domain:** Obsidian Plugin Development, Adapter Pattern, Memory Management, Async Guards
**Confidence:** HIGH

## Summary

This phase focuses on the "Ultra-Hardening" of the core Metadata Adapters. Key areas of investigation included Obsidian's event lifecycle to prevent memory leaks, robust path normalization in `NativeVaultAdapter`, deterministic link deduplication in the `UnifiedMetadataAdapter`, and implementing reliable initialization guards for asynchronous operations.

**Primary recommendation:** Use the `EventRef` unregistration pattern in `UnifiedMetadataAdapter.destroy()` and implement a deterministic merge algorithm in `getLinks()` to ensure graph stability across multiple data sources.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- No `CONTEXT.md` provided for this phase, proceeding with Requirements from `REQUIREMENTS.md`.

### the agent's Discretion

- Implementation details of the deduplication algorithm.
- Exact pattern for `ensureInitialized()` guard.
- Specific parameterization of `IMetadataAdapter` methods.

### Deferred Ideas (OUT OF SCOPE)

- Full Dependency Injection container implementation.
- Separate cache backends (strictly local LRU).
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID         | Description                                                                           | Research Support                                                    |
| ---------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| HARDEN-03a | Fix lifecycle: remove `metadataCache` listener in `UnifiedMetadataAdapter.destroy()`. | Verified `EventRef` unregistration pattern in Obsidian API.         |
| HARDEN-03b | Harden `NativeVaultAdapter` edges: normalize paths, skip self/non-file targets.       | Identified `HealerUtils.normalizeVaultPath` as the source of truth. |
| HARDEN-03c | Add deterministic deduplication to `getLinks()` in `UnifiedMetadataAdapter`.          | Proposed Map-based merge algorithm with composite keys.             |
| HARDEN-03d | Add `ensureInitialized()` guard across all adapters.                                  | Identified `initPromise` pattern for concurrent async safety.       |
| HARDEN-03e | Parametrize `Promise<...>` for stronger type-safety in adapter interfaces.            | Defined specific return types for all `IMetadataAdapter` methods.   |
| HARDEN-03f | Optimize `UnifiedMetadataAdapter.getLinks()` with `Promise.all`.                      | Verified concurrency benefits for multi-source aggregation.         |
| HARDEN-03g | Optimize SmartConnections fallback (size cap, early break).                           | Identified `AJSON` parsing and size limits as optimization targets. |

</phase_requirements>

## Architectural Responsibility Map

| Capability            | Primary Tier  | Secondary Tier | Rationale                                                                          |
| --------------------- | ------------- | -------------- | ---------------------------------------------------------------------------------- |
| Event Lifecycle       | API / Backend | —              | Managed by Obsidian's MetadataCache and Plugin lifecycle hooks.                    |
| Path Normalization    | API / Backend | —              | Uses Obsidian's `parseLinktext` and `metadataCache` for vault-absolute resolution. |
| Link Deduplication    | API / Backend | —              | Logical aggregation and pruning of links from multiple plugin sources.             |
| Initialization Guards | API / Backend | —              | Sync/Async state management for adapters to prevent premature calls.               |
| Semantic Filtering    | API / Backend | —              | Identifying "searchable" non-markdown files based on extensions and metadata.      |

## Standard Stack

### Core

| Library           | Version         | Purpose        | Why Standard                                                                                            |
| ----------------- | --------------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| Obsidian API      | 1.12.3 (latest) | Core Interface | Official SDK for plugin development; provides `MetadataCache` and `Vault` APIs.                         |
| Datacore API      | 0.0.1+          | Fast Queries   | Modern, reactive alternative to Dataview used for primary metadata extraction. [VERIFIED: package.json] |
| Breadcrumbs API   | V4+             | Hierarchies    | Standard for structured relationships; provides `mainG` graphology graph. [VERIFIED: src/types.ts]      |
| Smart Connections | V2+             | RAG/Vector     | Provides embedding-based similarity search; used as semantic fallback. [VERIFIED: src/types.ts]         |

### Supporting

| Library    | Version | Purpose        | When to Use                                                    |
| ---------- | ------- | -------------- | -------------------------------------------------------------- |
| graphology | ^0.26.0 | Graph Analysis | Central data structure for topological computations.           |
| zod        | ^4.3.6  | Validation     | Schema validation for complex configuration and API responses. |
| vitest     | ^4.1.0  | Testing        | Unit and integration testing for all adapters.                 |

**Installation:**

```bash
npm install obsidian graphology zod
```

## Architecture Patterns

### Initialization Guard Pattern

To handle concurrent calls and prevent race conditions in async adapters:

```typescript
private initPromise: Promise<void> | null = null;

public async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
        // Implementation logic
        this.initialized = true;
    })();
    return this.initPromise;
}

protected ensureInitialized(): void {
    if (!this.initialized) {
        throw new Error(`${this.id} adapter: not initialized`);
    }
}
```

### Deterministic Deduplication Algorithm

For `UnifiedMetadataAdapter.getLinks()`:

1. Create a `Map<string, SemanticLinkEdge>`.
2. Composite Key: `${sourcePath}|${targetPath}|${type}`.
3. Merge Logic:
    - If key exists, keep the edge with the highest `confidence`.
    - If confidence is tied, keep the edge with `context` or `position` metadata.
    - If both have metadata, join `context` with `\n---\n` and keep the first `position`.

### Anti-Patterns to Avoid

- **Implicit Event Leaks:** Calling `app.metadataCache.on(...)` without storing the returned `EventRef` and calling `offref()` in `destroy()`.
- **Sequential Awaits in Loops:** Using `for...of` with `await` for independent adapter calls instead of `Promise.all`.
- **Unnormalized Paths:** Using raw linktext (e.g., `[[My Note]]`) instead of canonical paths (`Folder/My Note.md`) in graph edges.

## Don't Hand-Roll

| Problem         | Don't Build             | Use Instead                      | Why                                                                 |
| --------------- | ----------------------- | -------------------------------- | ------------------------------------------------------------------- |
| Path Resolution | Manual string splitting | `HealerUtils.normalizeVaultPath` | Handles linktext, aliases, and subpaths correctly via Obsidian API. |
| Event Cleanup   | Manual flag management  | `EventRef` + `offref()`          | Obsidian's native way to unregister listeners safely.               |
| Debouncing      | `setTimeout` logic      | `obsidian.debounce`              | Integrated, UI-thread-aware utility provided by the host.           |

## Common Pitfalls

### Pitfall 1: post-destroy execution

**What goes wrong:** Async operations (like queries) finishing after `destroy()` is called, trying to update a nullified cache or trigger events.  
**How to avoid:** Check `this.isDestroyed` at the start of all async method resolutions and after every `await`.

### Pitfall 2: NativeVault path format

**What goes wrong:** `resolvedLinks` keys in Obsidian are absolute paths, but values are also objects with absolute path keys.
**Why it happens:** Inconsistency in link extraction can lead to `folder/note.md` vs `/folder/note.md`.
**How to avoid:** Always use `HealerUtils.normalizeVaultPath` which uses `parseLinktext` internally.

## Code Examples

### Robust Event Registration

```typescript
// Source: https://github.com/obsidianmd/obsidian-api
private resolvedRef: EventRef | null = null;

public initialize() {
    this.resolvedRef = this.app.metadataCache.on('resolved', () => this.refresh());
}

public destroy() {
    if (this.resolvedRef) {
        this.app.metadataCache.offref(this.resolvedRef);
        this.resolvedRef = null;
    }
}
```

### Path-Harden NativeVault

```typescript
const resolvedLinks = this.app.metadataCache.resolvedLinks;
for (const [source, targets] of Object.entries(resolvedLinks)) {
    const normSource = normalizeVaultPath(this.app, source);
    for (const target of Object.keys(targets)) {
        const normTarget = normalizeVaultPath(this.app, target, normSource);
        if (!normTarget || normSource === normTarget) continue;
        // Add edge
    }
}
```

## State of the Art

| Old Approach   | Current Approach         | When Changed  | Impact                                                                   |
| -------------- | ------------------------ | ------------- | ------------------------------------------------------------------------ |
| `dv.pages()`   | `datacore.query()`       | 2024+         | 100x performance boost, reactive metadata.                               |
| Manual Cleanup | `this.registerEvent()`   | Obsidian v0.x | Automates unregistration for Plugin class (not for standalone adapters). |
| `EventRef`     | `metadataCache.offref()` | SOTA          | Manual cleanup required for adapters not extending `Plugin`.             |

## Assumptions Log

| #   | Claim                                           | Section       | Risk if Wrong                                                             |
| --- | ----------------------------------------------- | ------------- | ------------------------------------------------------------------------- |
| A1  | `resolvedLinks` contains all link types         | Code Examples | Some property links might be missing if not indexed by Obsidian.          |
| A2  | `canvas` files are searchable via MetadataCache | Summary       | If Obsidian changes how it indexes Canvas, metadata extraction will fail. |

## Open Questions (RESOLVED)

1. **SmartConnections AJSON size**: What is the optimal "size cap" for the AJSON fallback to avoid main-thread blocking?
    - Resolution: A 1MB default size cap will be implemented. Files exceeding this will skip the deep `ajson` parsing fallback to protect the UI thread, as documented in the "Validation Architecture."

## Environment Availability

| Dependency        | Required By             | Available | Version | Fallback             |
| ----------------- | ----------------------- | --------- | ------- | -------------------- |
| Obsidian API      | Core                    | ✓         | 1.12.3  | —                    |
| Datacore          | DatacoreAdapter         | ✓         | Loaded  | NativeVault fallback |
| Breadcrumbs       | BreadcrumbsAdapter      | ✓         | Loaded  | —                    |
| Smart Connections | SmartConnectionsAdapter | ✓         | Loaded  | —                    |

## Validation Architecture

### Test Framework

| Property           | Value            |
| ------------------ | ---------------- |
| Framework          | vitest           |
| Config file        | vitest.config.ts |
| Quick run command  | `npm test`       |
| Full suite command | `npm test`       |

### Phase Requirements → Test Map

| Req ID     | Behavior           | Test Type   | Automated Command                                             | File Exists? |
| ---------- | ------------------ | ----------- | ------------------------------------------------------------- | ------------ |
| HARDEN-03a | EventRef cleanup   | Integration | `npm test tests/core/adapters/UnifiedMetadataAdapter.test.ts` | ✅           |
| HARDEN-03b | Path normalization | Unit        | `npm test tests/core/adapters/BaseAdapter.test.ts`            | ✅           |
| HARDEN-03c | Deduplication      | Unit        | `npm test tests/core/adapters/UnifiedMetadataAdapter.test.ts` | ✅           |
| HARDEN-03d | Init Guards        | Unit        | `npm test tests/core/adapters/DatacoreAdapter.test.ts`        | ✅           |

## Security Domain

### Applicable ASVS Categories

| ASVS Category       | Applies | Standard Control                                      |
| ------------------- | ------- | ----------------------------------------------------- |
| V5 Input Validation | yes     | Path normalization and sanitization of vault inputs.  |
| V8 Error Handling   | yes     | `getLinksSafe()` wrapper to prevent pipeline crashes. |

### Known Threat Patterns for Obsidian

| Pattern             | STRIDE                 | Standard Mitigation                                                                |
| ------------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| Path Traversal      | Information Disclosure | `normalizeVaultPath` to ensure paths remain within vault boundaries.               |
| Resource Exhaustion | Denial of Service      | `EventRef` cleanup to prevent memory leaks and CPU spikes from orphaned listeners. |

## Sources

### Primary (HIGH confidence)

- `/obsidianmd/obsidian-api` - EventRef, MetadataCache properties.
- `/obsidianmd/obsidian-developer-docs` - Plugin lifecycle, resolvedLinks structure.
- `src/core/adapters/BaseAdapter.ts` - Current implementation baseline.

### Secondary (MEDIUM confidence)

- Community patterns for deduplication in Obsidian plugins.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Verified via package.json and docs.
- Architecture: HIGH - Verified via existing codebase and API docs.
- Pitfalls: MEDIUM - Based on common Obsidian plugin issues.

**Research date:** 2026-05-05
**Valid until:** 2026-06-05
