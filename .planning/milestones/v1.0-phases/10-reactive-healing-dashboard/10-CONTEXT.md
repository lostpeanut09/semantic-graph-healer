# Phase 10 Context & Decisions: Reactive Healing Dashboard

This document captures the implementation decisions for Phase 10, ensuring downstream planners and executors understand the chosen architecture and user preferences.

## 1. Framework & Architecture

- **Decision:** Use **Svelte 5 (Runes)** for the dashboard UI.
- **State Management:** Implement a **Centralized Svelte Store** pattern. Use `$state` and `$derived` runes to sync with the core `plugin.cache.suggestions` while decoupling the UI from the engine's internal classes.
- **Reactivity:** The store should react to cache refresh events from `PluginContext`.

## 2. Dashboard Layout

- **Decision:** Transition from a linear list to a **Tabbed/Categorized View**.
- **Tabs:**
    - **Structural Gaps** (Bridges)
    - **Logic Loops** (Ouroboros)
    - **Sinks** (Black Holes)
    - **AI Suggestions** (Proximity, Tags)
- **Goal:** Improve scannability for large vaults.

## 3. Interaction & Feedback

- **Decision:** Implement a **Hybrid Interaction Model**.
- **Action "Execute":** The suggestion transitions to a **"Fixed" state** (remains in the list but marked as complete/inactive) to provide persistent visual confirmation.
- **Action "Ignore":** The suggestion is **instantly removed** from the view with a temporary **"Undo" toast notification**.

## 4. Bulk Operations

- **Decision:** Enable **Batch Healing**.
- **Features:** "Fix All" button per category (e.g., "Resolve all 12 structural gaps").
- **Safety:** Use `Notice` to report progress during batch runs.

---

_Generated during Phase 10 Planning Phase._
