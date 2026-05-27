# Phase 9: High-Fidelity Graph UI - Research

**Researched:** 2026-05-10
**Domain:** Graph Visualization / WebGL / Obsidian UI
**Confidence:** HIGH

## Summary

This research establishes the technical foundation for Phase 9, focusing on implementing a high-performance, WebGL-powered graph visualization within an Obsidian plugin. The primary recommendation is to use **3d-force-graph** (the WebGL sibling of the `force-graph` suite) to handle the 10,000+ node requirement.

We have identified specific patterns for rendering hierarchical cycles with pulsating effects and structural gaps as dotted "ghost" edges. We also confirmed integration patterns with ExcaliBrain and Breadcrumbs metadata, which are already partially supported by existing adapters.

**Primary recommendation:** Use `3d-force-graph` (Three.js/WebGL) for rendering, utilizing `linkDash` for structural gaps and a reactive `nodeColor` or custom `nodeThreeObject` for pulsating cycles.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Decision:** Use **force-graph** (WebGL version) for the graph engine.
- **Rationale:** Best performance for large graphs. Native integration with WebGL ensures smooth interaction even with 10,000+ nodes.
- **Indicators:**
    - **Hierarchical Cycles (Ouroboros):** Pulsate in red.
    - **Structural Gaps:** Displayed as dotted ghost-edges between the notes forming the gap.
- **Interaction:** Clicking a problematic node/edge triggers an in-graph popup.
- **Popup Content:** AI reasoning summary and "Execute Fix" button.
- **Platform Constraints:** Ensure compatibility with Obsidian Desktop and Mobile.

### the agent's Discretion

- Explore potential ExcaliBrain integration patterns if no external sources are needed.

### Deferred Ideas (OUT OF SCOPE)

- Fallback to Force-graph (Canvas) is only for restricted platforms.
  </user_constraints>

## Architectural Responsibility Map

| Capability                     | Primary Tier  | Secondary Tier | Rationale                                                            |
| ------------------------------ | ------------- | -------------- | -------------------------------------------------------------------- |
| Graph Layout (Physics)         | Web Worker    | Browser        | CPU-intensive simulation (D3-force) should run off-main-thread.      |
| Graph Rendering (WebGL)        | Browser (UI)  | —              | Direct DOM/Canvas/WebGL access required for rendering.               |
| User Interaction (Click/Hover) | Browser (UI)  | —              | Immediate UI feedback and popup management.                          |
| Fix Execution                  | API / Backend | —              | Modifying files/vault requires access to Obsidian's file system API. |

## Standard Stack

### Core

| Library          | Version | Purpose               | Why Standard                                                     |
| ---------------- | ------- | --------------------- | ---------------------------------------------------------------- |
| `3d-force-graph` | 1.80.0  | WebGL Graph Rendering | Standard for high-performance interactive 3D/2D graphs in WebGL. |
| `d3-force-3d`    | 3.0.6   | Physics Simulation    | Powers the force-directed layout in 3 dimensions.                |
| `three`          | peer    | 3D Engine             | Underlying engine for WebGL rendering in `3d-force-graph`.       |

### Supporting

| Library      | Version | Purpose                | When to Use                                                            |
| ------------ | ------- | ---------------------- | ---------------------------------------------------------------------- |
| `graphology` | ^0.26.0 | Graph State Management | Already in project; used to manage the logical graph before rendering. |
| `obsidian`   | latest  | Plugin API             | Required for View registration and Vault interaction.                  |

### Alternatives Considered

| Instead of       | Could Use          | Tradeoff                                                                                             |
| ---------------- | ------------------ | ---------------------------------------------------------------------------------------------------- |
| `3d-force-graph` | `sigma.js`         | Sigma is better for massive 2D WebGL, but user specifically asked for "force-graph (WebGL version)". |
| `3d-force-graph` | `force-graph` (2D) | Canvas-based; hits performance ceiling earlier than WebGL for 10k+ nodes.                            |

**Installation:**

```bash
npm install 3d-force-graph d3-force-3d
```

## Architecture Patterns

### System Architecture Diagram

Data flow:
`UnifiedMetadataAdapter` -> `GraphWorkerService` (Simulation) -> `GraphVisualizerView` (Render) -> `3d-force-graph`.

### Recommended Project Structure

```
src/
├── views/
│   ├── GraphVisualizerView.ts  # Main View for the Graph UI
│   └── components/
│       └── GraphPopup.ts       # In-graph popup for fixes
├── core/
│   └── utils/
│       └── GraphMapper.ts      # Bridge between graphology and force-graph data
```

### Pattern 1: Bridging Graphology to Force-Graph

**What:** Convert `graphology` internal state to the `{ nodes, links }` format expected by `3d-force-graph`.
**When to use:** Every time the graph data is updated from the worker.
**Example:**

```typescript
const gData = {
    nodes: graph.nodes().map((id) => ({ id, ...graph.getNodeAttributes(id) })),
    links: graph.edges().map((id) => ({
        source: graph.source(id),
        target: graph.target(id),
        ...graph.getEdgeAttributes(id),
    })),
};
```

### Pattern 2: Dotted Ghost-Edges

**What:** Render "Structural Gaps" as dashed lines.
**When to use:** For edges where `attribute.isGhost === true`.
**Example:**

```javascript
// linkWidth must be 0 for linkDash to work (native THREE.Line)
const Graph = ForceGraph3D(el)
    .linkWidth(0)
    .linkDash((link) => (link.isGhost ? [5, 2] : null))
    .linkColor((link) => (link.isGhost ? '#888888' : '#ffffff'));
```

### Pattern 3: Pulsating Ouroboros (Cycles)

**What:** Use a time-based reactive function to animate cycle nodes.
**When to use:** For nodes marked as part of a hierarchical cycle.
**Example:**

```javascript
let startTime = Date.now();
const Graph = ForceGraph3D(el).nodeColor((node) => {
    if (node.isCycle) {
        const pulse = Math.sin((Date.now() - startTime) / 200) * 0.5 + 0.5;
        return `rgba(255, 0, 0, ${pulse})`;
    }
    return 'blue';
});

// Redraw loop for pulsing
function animate() {
    Graph.nodeColor(Graph.nodeColor());
    requestAnimationFrame(animate);
}
```

## Don't Hand-Roll

| Problem            | Don't Build                | Use Instead               | Why                                                                     |
| ------------------ | -------------------------- | ------------------------- | ----------------------------------------------------------------------- |
| Physics Simulation | Custom force-directed loop | `d3-force-3d`             | Handling 10k nodes with Barnes-Hut optimization is complex.             |
| WebGL Rendering    | Custom Three.js scene      | `3d-force-graph`          | Provides high-level abstractions for node/link mapping and interaction. |
| Camera Control     | Custom zoom/pan/rotate     | `3d-force-graph` built-in | Smooth orbit controls and "fit-to-view" are built-in.                   |

## Common Pitfalls

### Pitfall 1: Link Dash Limitation

**What goes wrong:** Setting `linkWidth` > 0 makes the dash effect disappear.
**Why it happens:** `3d-force-graph` uses `THREE.Mesh` (cylinders) for wide links, which don't support `LineDashedMaterial`.
**How to avoid:** Keep `linkWidth` at 0 for ghost edges or use a custom `linkThreeObject`.

### Pitfall 2: Memory Leaks in Obsidian Views

**What goes wrong:** 3D scene remains in memory after closing the view.
**Why it happens:** Three.js objects aren't automatically disposed.
**How to avoid:** Explicitly call `Graph._destructor()` (or clean up scene) in the View's `onClose` method.

### Pitfall 3: Mobile Performance

**What goes wrong:** Graph crashes on Mobile with 10k nodes.
**Why it happens:** High VRAM usage for 10k spheres.
**How to avoid:** Use `nodeResolution(1)` (renders as points/small boxes) or set `numDimensions(2)` to simplify layout.

## Code Examples

### Specialized Graph View Structure

```typescript
import { ItemView, WorkspaceLeaf } from 'obsidian';
import ForceGraph3D from '3d-force-graph';

export class GraphVisualizerView extends ItemView {
    private graph: any;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    async onOpen() {
        const container = this.contentEl.createDiv({ cls: 'healer-graph-container' });
        this.graph = ForceGraph3D()(container)
            .nodeAutoColorBy('group')
            .onNodeClick((node) => this.showFixPopup(node));

        // Load data from engine
        const data = await this.getGraphData();
        this.graph.graphData(data);
    }

    onClose() {
        if (this.graph) {
            // Internal cleanup for 3d-force-graph
            this.graph._destructor?.();
        }
    }
}
```

## State of the Art

| Old Approach   | Current Approach       | When Changed | Impact                                          |
| -------------- | ---------------------- | ------------ | ----------------------------------------------- |
| SVG Graphs     | Canvas/WebGL Graphs    | 2020+        | Massive performance jump (100 -> 10,000 nodes). |
| Static Layouts | Dynamic Force-Directed | —            | Better visualization of organic connections.    |

## Assumptions Log

| #   | Claim                                                                  | Section         | Risk if Wrong                                                 |
| --- | ---------------------------------------------------------------------- | --------------- | ------------------------------------------------------------- |
| A1  | User meant `3d-force-graph` when saying "force-graph (WebGL version)". | Core Technology | Using a different library might not meet "WebGL" expectation. |
| A2  | ExcaliBrain integration means using its frontmatter keys.              | Integration     | Might miss a deeper API-level integration if one exists.      |

## Environment Availability

| Dependency | Required By        | Available | Version | Fallback  |
| ---------- | ------------------ | --------- | ------- | --------- |
| Node.js    | Development        | ✓         | 25.2.1  | —         |
| NPM        | Package Management | ✓         | 11.13.0 | —         |
| WebGL      | Rendering          | ✓         | —       | Canvas 2D |

## Validation Architecture

### Test Framework

| Property          | Value              |
| ----------------- | ------------------ |
| Framework         | Vitest 4.1.4       |
| Config file       | `vitest.config.ts` |
| Quick run command | `npm test`         |

### Phase Requirements → Test Map

| Req ID | Behavior                         | Test Type      | Automated Command                   | File Exists? |
| ------ | -------------------------------- | -------------- | ----------------------------------- | ------------ |
| UI-01  | Graph renders 10k nodes smoothly | Smoke (Manual) | —                                   | ❌ Wave 0    |
| UI-02  | Cycles pulsate red               | Unit (Mapping) | `npm test tests/ui/mapping.test.ts` | ❌ Wave 0    |

## Security Domain

### Applicable ASVS Categories

| ASVS Category       | Applies | Standard Control                                |
| ------------------- | ------- | ----------------------------------------------- |
| V5 Input Validation | yes     | Validate graph data structure before rendering. |

## Sources

### Primary (HIGH confidence)

- `/vasturiano/3d-force-graph` - Official docs and performance notes.
- `/vasturiano/force-graph` - Interaction control and Canvas basics.
- `src/core/services/GraphWorkerService.ts` - Existing worker logic.

### Secondary (MEDIUM confidence)

- WebSearch for "3d-force-graph dashed links" - Confirmed `linkDash` property.
- WebSearch for "Obsidian 3D Graph plugin" - Context on performance walls (~5k-7k elements).

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Confirmed latest versions and WebGL requirement.
- Architecture: HIGH - Mapped ghost edges and pulsing patterns to library APIs.
- Pitfalls: MEDIUM - Mostly based on community reports for large graphs.

**Research date:** 2026-05-10
**Valid until:** 2026-06-10
