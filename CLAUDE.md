# Semantic Graph Healer — GSD Instructions

Welcome to the **Semantic Graph Healer** project. This file provides critical architectural guidance and enforced workflows for all agents working in this repository.

## Core Project Mandate

**Vision:** A production-grade topological restoration and deep graph analysis engine for Obsidian knowledge graphs.

## Quality Assurance Pipeline (MANDATORY)

Every modification MUST strictly follow this pipeline before completion:

1. **Validation Suite:**
   - `npm run lint` (ESLint) — Zero warnings allowed.
   - `npm run format` (Prettier).
   - `npx knip` (Dead code analysis).
   - `npm run test` (Vitest suite).
   - `npm run build` (TSC & ESBuild).

2. **Council Workflow:**
   - **Plan:** Update `.planning/` artifacts (Phase Plans, REQUIREMENTS.md).
   - **Implement:** Perform the changes surgically.
   - **Internal Test:** Run project tests.
   - **External Review:** Run `/council:review` for Kilo AI feedback.
   - **Fix & Harden:** Address all High/Medium findings.
   - **Final Verification:** Re-run all tests.

## Architectural Conventions

- **Adapter Pattern:** All external dependencies (Datacore, Breadcrumbs, etc.) MUST be abstracted behind `IMetadataAdapter` and injected via ports.
- **Web Worker Offloading:** Any O(N²) or heavier graph algorithms MUST be implemented in `src/core/workers/` and accessed via `GraphWorkerService`.
- **Reactivity:** New UI components MUST use Svelte 5 Runes.
- **Credential Safety:** NEVER store plain-text keys in `data.json`. Use `KeychainService` (SecretStorage).
- **Type Safety:** Use `instanceof` for TFile/TFolder. Avoid `any`.

## GSD Workflow Commands

- `/gsd:progress` — Check project status.
- `/gsd:plan-phase N` — Plan phase N.
- `/gsd:discuss-phase N` — Brainstorm phase N.
- `/gsd:verify-phase N` — Verify phase deliverables.

## Traceability

Current roadmap and requirements are maintained in `.planning/`.
Refer to `.planning/ROADMAP.md` for the current execution state.

---
*Environment: Gemini CLI / Obsidian Plugin*
