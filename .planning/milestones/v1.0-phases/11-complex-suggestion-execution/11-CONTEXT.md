# Phase 11 Context: Complex Suggestion Execution

## Domain Boundary

**Goal:** One-click repair for sophisticated topological issues.
**Scope:** Complex Suggestion Execution (Triple Relink Executor, atomic and reversible multi-file edits).
We are clarifying HOW to implement this. (New capabilities belong in other phases.)

## Canonical References

_Read these before planning:_

- `.planning/ROADMAP.md` (Phase 11 section)
- `.planning/REQUIREMENTS.md` (UX-02 requirement)
- `src/core/SuggestionExecutor.ts` (Existing suggestion executor logic)

## Decisions

### 1. Atomicity of Multi-File Edits

- **Decision:** Strong Atomicity (Rollback)
- **Rationale:** If any file (A, B, or C) fails to update, automatically revert the others to their original state and report failure. This ensures the graph topology does not get corrupted with partial changes.

### 2. Reversibility of Executed Heals

- **Decision:** Memento Pattern (Full History)
- **Rationale:** Write the files immediately, but save a snapshot of the frontmatter in `PluginContext` history to allow reversing the physical changes later. This is necessary because of the requirement that edits are atomic and reversible.

### 3. UI Feedback for Complex Executions

- **Decision:** Pre-flight Confirmation Modal
- **Rationale:** Show a quick breakdown of the 3 files that will be touched before executing the fix, giving the user transparency on what will happen across the vault.

## Code Context & Assets

- `src/core/SuggestionExecutor.ts`: `executeRelink` function is where the logic resides and needs to be updated for atomicity and memento capture.
- `src/views/dashboard/DashboardStore.svelte.ts`: Manages `history` where the memento can be stored, and provides UI methods. Need to implement the confirmation modal logic here.
