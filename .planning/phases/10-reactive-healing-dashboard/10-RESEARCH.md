# Phase 10: Reactive Healing Dashboard - Research

**Researched:** 2026-10-05
**Domain:** Svelte 5 Integration & Reactive Dashboard Architecture
**Confidence:** HIGH

## Summary

This phase focuses on rebuilding the Obsidian Healer Dashboard using **Svelte 5 (Runes)** to achieve a highly responsive, tabbed UI that stays in sync with the core engine. Research confirms that Svelte 5 is compatible with Obsidian's CommonJS environment when bundled via `esbuild` with specific configurations. The architecture will transition from manual DOM manipulation to a **Reactive Adapter** pattern, where a Svelte-aware store mirrors the internal state of the Healer engine.

**Primary recommendation:** Use a Class-based Svelte Store in a `.svelte.ts` file to bridge the non-reactive `PluginContext` with the Svelte UI, and implement batch execution using a yielding loop to maintain UI responsiveness during "Fix All" operations.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| UI Rendering | Browser (Svelte) | — | Svelte 5 handles all DOM updates and state-to-view mapping. |
| State Management | Browser (Store) | API (Core Cache) | The Svelte Store acts as a reactive proxy for the core `PluginCache`. |
| Action Execution | API (Executor) | — | The `SuggestionExecutor` remains the owner of file-system modifications. |
| UI Feedback | Browser (Notice) | Browser (Svelte) | Obsidian's `Notice` API is used for global toasts; Svelte handles in-dashboard state. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| svelte | 5.55.5 | UI Framework | SOTA reactivity (Runes), minimal overhead, excellent for complex dashboards. [VERIFIED: npm] |
| esbuild-svelte | 0.9.5 | Build Plugin | Bridges Svelte compiler with esbuild; supports Svelte 5. [VERIFIED: npm] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|--------------|
| svelte-preprocess | 6.0.3 | TS/PostCSS support | Required for using TypeScript inside `.svelte` components. [VERIFIED: npm] |
| obsidian | latest | Host API | Interaction with vault, workspace, and notifications. [CITED: docs.obsidian.md] |

**Installation:**
```bash
npm install svelte@5
npm install -D esbuild-svelte svelte-preprocess
```

## Architecture Patterns

### System Architecture Diagram
The dashboard follows a **Reactive Adapter** pattern to sync the core engine with the UI.

```
[ Healer Core ] <--- (Events/Cache Refresh) --- [ PluginContext ]
      |                                              |
      | (Read/Write)                                 | (Propagates)
      v                                              v
[ SuggestionExecutor ] <--- (Actions) --- [ Svelte Dashboard Store ]
                                              |
                                              | ($state, $derived)
                                              v
                                       [ Svelte UI Components ]
```

### Recommended Project Structure
```
src/
├── views/
│   ├── dashboard/
│   │   ├── DashboardStore.svelte.ts  # Reactive Adapter
│   │   ├── DashboardView.ts          # Obsidian View Wrapper
│   │   ├── components/
│   │   │   ├── Dashboard.svelte      # Main Layout (Tabs)
│   │   │   ├── SuggestionCard.svelte # Individual items
│   │   │   └── CategorySection.svelte# Grouping logic
```

### Pattern 1: Reactive Adapter Store
**What:** A class in a `.svelte.ts` file that holds `$state` and mirrors the core cache.
**When to use:** Syncing non-Svelte state (from the engine) with Svelte components.
**Example:**
```typescript
// src/views/dashboard/DashboardStore.svelte.ts
export class DashboardStore {
    #suggestions = $state<Suggestion[]>([]);

    constructor(private plugin: SemanticGraphHealer) {
        this.refresh();
        // Subscribe to core events if available, or manual refresh
    }

    refresh() {
        this.#suggestions = [...this.plugin.cache.suggestions];
    }

    get suggestions() { return this.#suggestions; }
    
    // Derived state for tabs
    get structuralGaps() { 
        return this.#suggestions.filter(s => s.id.startsWith('bridge_gap')); 
    }
}
```

### Pattern 2: Undo Notice (DocumentFragment)
**What:** Using Obsidian's `Notice` with a `DocumentFragment` to include interactive buttons.
**Example:**
```typescript
const frag = new DocumentFragment();
frag.createSpan({ text: "Suggestion ignored. " });
const undoBtn = frag.createEl("button", { text: "Undo", cls: "mod-cta" });
undoBtn.onclick = () => {
    // Restore logic
    notice.hide();
};
const notice = new Notice(frag, 5000);
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UI Reactivity | Custom event listeners | Svelte 5 Runes | `$state` and `$derived` handle dependency tracking automatically. |
| CSS Theming | Custom hardcoded colors | Obsidian CSS Vars | Uses `--background-primary`, `--text-normal` to match user theme. |
| Batch Locking | Parallel `Promise.all` | Sequential Yielding | `app.fileManager.processFrontMatter` is safer; yielding prevents UI freeze. |

## Common Pitfalls

### Pitfall 1: UI Lockup during Batch Fix
**What goes wrong:** Processing 100+ suggestions sequentially without yielding blocks the main thread.
**How to avoid:** Use `setTimeout(0)` every 5-10 items to allow the event loop to process UI updates.
**Warning signs:** Obsidian becomes unresponsive; "Fixed X" notices appear all at once at the end.

### Pitfall 2: Svelte 5 Mounting API
**What goes wrong:** Attempting to use `new Component({ target })` (Svelte 4 style).
**How to avoid:** Use `import { mount, unmount } from "svelte"` and `mount(Component, { target })`. [VERIFIED: Svelte 5 docs]

### Pitfall 3: Store State Leakage
**What goes wrong:** Shared global state between multiple dashboard leaves.
**How to avoid:** Instantiate the `DashboardStore` within the `ItemView` or use `setContext` if there are multiple instances.

## Code Examples

### Batch Execution with Progress (Yielding)
```typescript
async function fixAll(suggestions: Suggestion[]) {
    const notice = new Notice(`Fixing ${suggestions.length} items...`, 0);
    let count = 0;
    for (const s of suggestions) {
        await executor.execute(s);
        count++;
        notice.setMessage(`Fixing: ${count}/${suggestions.length}`);
        if (count % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }
    notice.hide();
    new Notice("Batch fix complete.");
}
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build process | ✓ | 20.x | — |
| Obsidian | Runtime | ✓ | 1.x | — |
| esbuild | Build process | ✓ | 0.21.x | — |

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Validate `Suggestion` data before rendering to avoid XSS in Svelte (`{@html ...}`). |
| V10 Communication | no | Dashboard is local-only. |

## Sources

### Primary (HIGH confidence)
- Svelte 5 Official Documentation - Runes, Mounting API.
- Obsidian Developer Docs - `ItemView`, `Notice`, `processFrontMatter`.
- `esbuild-svelte` GitHub - Configuration for Svelte 5.

### Secondary (MEDIUM confidence)
- Community Plugin Templates - `svelte-5-obsidian-template` search results.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Current versions verified via npm.
- Architecture: HIGH - Reactive Adapter is a proven pattern for Svelte/Core separation.
- Pitfalls: HIGH - UI lockup is a well-known issue in Obsidian batching.

**Research date:** 2026-10-05
**Valid until:** 2026-11-05
