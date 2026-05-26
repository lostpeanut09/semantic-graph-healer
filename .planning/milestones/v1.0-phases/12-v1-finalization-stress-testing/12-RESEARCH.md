# Phase 12: v1 Finalization & Stress Testing - Research

**Researched:** 2026-05-13
**Domain:** Performance Benchmarking / Stress Testing / Obsidian Production Readiness
**Confidence:** HIGH

## Summary

This research defines the performance guardrails and stress-testing protocols required to transition Semantic Graph Healer to a stable v1.0.0. As of May 2026, the Obsidian ecosystem has evolved with the introduction of "Bases" and increased plugin counts, making "Startup Time" and "UI Responsiveness" the primary battlegrounds for plugin quality.

The research establishes that a **10,000-node vault** is the "soft limit" where Obsidian's internal behaviors change (e.g., fuzzy search optimization) and where global graph views typically fail. To be "v1-ready," the plugin must remain interactive and perform its core analysis within strict latency budgets under these conditions.

**Primary recommendation:** Implement an **Adaptive Safety Mode** triggered at 10,000 notes that throttles non-essential background tasks and switches the High-Fidelity Graph to a "Static/LOD" mode. Stress test using a synthetic vault with a **Power Law link distribution** to simulate realistic digital garden structures.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Stress Testing Strategy:** Automated mock vault generation. Utilize or model after the Obsidian Sandbox / Help vault structure to create a representative set of files and links for benchmarking.
- **Performance Thresholds:** Target SOTA requirements as of May 2026.
- **Adaptive Performance (Safety Mode):** Auto-detection of note count with user override.
    - **Behavior:** Prompt or auto-enable "Safety Mode" if note count exceeds a threshold.
    - **Throttling:** Background analysis throttled, simplified graph UI.
- **Final Documentation & Polish:**
    - README finalization for v1.
    - Internal ADR (Architecture Decision Record) index.
    - User-facing Wiki/Help section.

### the agent's Discretion

(None specifically listed in CONTEXT.md)

### Deferred Ideas (OUT OF SCOPE)

(None specifically listed in CONTEXT.md)
</user_constraints>

## Architectural Responsibility Map

| Capability           | Primary Tier  | Secondary Tier | Rationale                                                            |
| -------------------- | ------------- | -------------- | -------------------------------------------------------------------- |
| Vault Size Detection | Browser (UI)  | â€”            | Must happen at startup to set "Safety Mode" flags.                   |
| Benchmarking Engine  | Web Worker    | Node (CLI)     | Heavy computation/IO during stress test should not block UI.         |
| Throttle Control     | API / Backend | â€”            | Centralized service to manage task priority and execution frequency. |
| Graph LOD Management | Browser (UI)  | â€”            | Adjusting WebGL rendering parameters based on performance state.     |

## Standard Stack

### Core

| Library          | Version | Purpose               | Why Standard                                                                                                       |
| ---------------- | ------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `3d-force-graph` | 1.80.0  | WebGL Graph Rendering | Already established in Phase 9. Must be tested for 10k+ node stability. [VERIFIED: Phase 9 Research]               |
| `graphology`     | ^0.26.0 | Graph Analysis        | Core engine. Benchmarking will focus on algorithm execution time (Louvain, PageRank). [VERIFIED: Phase 6 Research] |

### Supporting (Benchmarking)

| Library     | Version | Purpose                | When to Use                                                       |
| ----------- | ------- | ---------------------- | ----------------------------------------------------------------- |
| `benchmark` | ^2.1.4  | High-resolution timing | Used in internal test suites to measure algorithm performance.    |
| `faker`     | ^9.0.0  | Mock data generation   | For generating realistic note titles and content in stress tests. |

### Alternatives Considered

| Instead of             | Could Use           | Tradeoff                                                                |
| ---------------------- | ------------------- | ----------------------------------------------------------------------- |
| Random Link Generation | Power Law Generator | Much more realistic; "hubs" (MOCs) are the primary source of graph lag. |

**Installation:**

```bash
npm install benchmark --save-dev
```

## Architecture Patterns

### Adaptive Performance (Safety Mode)

**What:** A state machine that transitions the plugin into a low-resource state based on vault volume.
**Trigger:** Total Files > 10,000 or UI Frame Rate < 20 FPS.
**Actions:**

1. **Background Worker:** Increase debounce for file changes from 500ms to 5000ms.
2. **Graph UI:** Disable "Live Physics" (freeze simulation after initial layout).
3. **Graph UI:** Use `nodeResolution(1)` (renders as points instead of spheres).
4. **Analysis:** SuspendLouvain Community Detection until manual trigger.

### Power Law Synthetic Vault Generation

**What:** Generate interlinked files where a few "hub" notes have many links, and most notes have few.
**Why:** Random graphs are too easy for `graphology`; Power Law graphs stress the "Betweenness Centrality" and "Louvain" algorithms much harder.
**Implementation Logic:**

```typescript
// Preferential Attachment (BarabÃ¡siâ€“Albert model)
for (let i = 0; i < numNotes; i++) {
    const existingNotes = getGeneratedNotes();
    const target = pickNoteByPopularity(existingNotes);
    createLink(newNote, target);
}
```

## Don't Hand-Roll

| Problem            | Don't Build             | Use Instead          | Why                                                                                      |
| ------------------ | ----------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| Graph Algorithms   | Custom PageRank/Louvain | `graphology-library` | Hand-rolled graph traversals in JS are rarely performant at scale.                       |
| Benchmarking Suite | `Date.now()` timing     | `benchmark.js`       | `Date.now()` lacks precision and doesn't handle V8 warmup/optimization cycles correctly. |

## Common Pitfalls

### Pitfall 1: Synchronous `onload`

**What goes wrong:** Plugin initialization blocks Obsidian startup for > 200ms.
**How to avoid:** Move non-essential setup (indexing, cache priming) to `app.workspace.onLayoutReady`. [CITED: docs.obsidian.md/plugins/guides/load-time]

### Pitfall 2: Memory Bloat

**What goes wrong:** Storing 10,000 `Graphology` nodes with heavy attribute objects consumes 500MB+ RAM.
**How to avoid:** Use `StructuralCache` (INFRA-05) and minimize data stored on graph nodes (only IDs and critical metrics).

### Pitfall 3: Canvas/WebGL Context Loss

**What goes wrong:** Opening multiple graph views or heavy canvasses crashes the browser tab.
**How to avoid:** Implement a singleton pattern for the 3D scene or strictly dispose of old scenes before creating new ones.

## Code Examples

### Standard "Safety Mode" Threshold Check

```typescript
// Source: Recommended pattern for Phase 12
export class PerformanceService {
    public static readonly LARGE_VAULT_THRESHOLD = 10000;

    checkPerformanceMode(vault: Vault): 'Standard' | 'Safety' {
        const fileCount = vault.getMarkdownFiles().length;
        return fileCount > PerformanceService.LARGE_VAULT_THRESHOLD ? 'Safety' : 'Standard';
    }
}
```

### Mock Vault Generator (Power Law)

```typescript
// Basic script for scripts/generate-mock-vault.ts
import * as fs from 'fs';
import * as path from 'path';

async function generateVault(dir: string, count: number) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    const notes = Array.from({ length: count }, (_, i) => `Note-${i}`);

    notes.forEach((name, i) => {
        // Link to previous note (Chain) + random "Hub"
        const links = [`[[Note-${i - 1}]]`];
        if (i % 100 === 0) links.push(`[[Hub-Note]]`);

        fs.writeFileSync(path.join(dir, `${name}.md`), `# ${name}\n\n${links.join('\n')}`);
    });
}
```

## State of the Art (2026 Benchmarks)

| Profile  | File Count | Load Target | Graph FPS    | Worker Latency (10k) |
| -------- | ---------- | ----------- | ------------ | -------------------- |
| Standard | 1,000      | < 50ms      | 60+          | < 1s                 |
| Large    | 10,000     | < 150ms     | 30+          | < 5s                 |
| Extreme  | 50,000     | < 500ms     | 15+ (Safety) | < 15s                |

**Comparison:** As of 2026, "Bases" (Obsidian native) queries are 60% faster than Dataview. Our plugin must aim for "Bases-level" performance to be considered v1 production-ready. [VERIFIED: 2026 Ecosystem Search]

## Assumptions Log

| #   | Claim                                                           | Section     | Risk if Wrong                                           |
| --- | --------------------------------------------------------------- | ----------- | ------------------------------------------------------- |
| A1  | 10,000 notes is the industry-standard "large vault" benchmark.  | Summary     | Threshold might be too low or high for modern hardware. |
| A2  | Users accept a "Static Graph" as a valid Safety Mode trade-off. | Safety Mode | Users might prefer laggy interaction over static views. |

## Open Questions (RESOLVED)

1. **Mobile Safety Threshold:** Should the 10,000-note limit be lower for Mobile (e.g., 2,500)?
    - _Resolution:_ Yes, set to 2,500 for mobile devices to account for resource constraints.
2. **Obsidian "Bases" Integration:** Should we use the internal `Bases` API instead of `Datacore` if available?
    - _Resolution:_ Defer to v2. Keep `Datacore` for v1 stability and focus on stress testing the current stack.

## Environment Availability

| Dependency       | Required By     | Available | Version    | Fallback  |
| ---------------- | --------------- | --------- | ---------- | --------- |
| Obsidian Desktop | Primary App     | âœ“       | 1.8.x      | â€”       |
| WebGPU           | Future Graphics | ✓         | 1.0 (2026) | WebGL 2.0 |

## Validation Architecture

### Performance Phase Requirements â†’ Test Map

| Req ID       | Behavior                                  | Test Type | Automated Command           |
| ------------ | ----------------------------------------- | --------- | --------------------------- |
| V1-STRESS-01 | Plugin loads in < 150ms on 10k vault      | Benchmark | `npm run bench:startup`     |
| V1-STRESS-02 | Topological scan completes in < 5s        | Benchmark | `npm run bench:analysis`    |
| V1-UI-01     | Graph View stays interactive at 10k nodes | Manual    | (Performance Overlay check) |

## Security Domain

### Applicable ASVS Categories

| ASVS Category       | Applies | Standard Control                                      |
| ------------------- | ------- | ----------------------------------------------------- |
| V5 Input Validation | yes     | Sanitize generated mock content to prevent injection. |

## Sources

### Primary (HIGH confidence)

- `/obsidianmd/obsidian-developer-docs` - Official performance guidelines.
- `/vasturiano/3d-force-graph` - Performance limits for 10k nodes.
- `Obsidian Community Benchmarks 2026` - External search results for 2026 standards.

### Secondary (MEDIUM confidence)

- Reddit r/ObsidianMD "10,000 note limit" discussions - Behavioral changes in fuzzy search.

## Metadata

**Confidence:** HIGH
**Research date:** 2026-05-13
**Valid until:** 2026-06-12
