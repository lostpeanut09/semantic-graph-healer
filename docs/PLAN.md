# Phase 13: Linting & Repository Hardening Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the repository by aligning with Obsidian's v1 release standards: eliminate lint warnings, replace 'any' with strict types in core services, enforce UI consistency, and upgrade CI/CD hooks.

**Architecture:** Use ESLint overrides for scripts, strict union types for worker messages, and systematic string updates for HIG compliance.

**Tech Stack:** TypeScript, ESLint, Husky, Obsidian API.

---

## Wave 1: Standards & Tooling

### Task 1: Resolve Script Lint Errors and Environment Overrides

**Files:** `.config/eslint.config.js`

- [ ] **Step 1:** Update `eslint.config.js` to add an override for the `scripts/` directory.
- [ ] **Step 2:** Allow Node.js built-ins (`fs`, `path`) and `no-console` for scripts.
- [ ] **Step 3:** Verify with `npm run lint scripts/generate-mock-vault.ts`.

### Task 2: Eliminate 'any' and Unsafe Types in Core

**Files:** `src/core/workers/graph-analysis-core.ts`, `src/views/dashboard/DashboardStore.svelte.ts`

- [ ] **Step 1:** Define `WorkerMessage` and `WorkerResponse` unions in `graph-analysis-core.ts`.
- [ ] **Step 2:** Replace `any` assignments with typed objects in the worker core.
- [ ] **Step 3:** Create a minimal interface for the plugin context in `DashboardStore.svelte.ts` and remove `@ts-ignore` / `any` bailouts.
- [ ] **Step 4:** Fix all TS1484 (import type) leftovers across the project.
- [ ] **Step 5:** Verify with `npm run build`.

### Task 3: Bulk UI Sentence Case Correction

**Files:** `src/main.ts`, `src/views/SettingsTab.ts`, `src/views/sections/*.ts`, `src/views/components/*.ts`

- [ ] **Step 1:** Systematically update all setting names, descriptions, and button labels to use **Sentence case**.
- [ ] **Step 2:** Follow `obsidianmd/ui/sentence-case` lint suggestions.
- [ ] **Step 3:** Verify with `npm run lint | grep "sentence-case"`.

### Task 4: Husky Pre-push Build Integration

**Files:** `.husky/pre-push`

- [ ] **Step 1:** Update `.husky/pre-push` to execute `npm run build`.
- [ ] **Step 2:** Ensure it fails the push if the build fails.
- [ ] **Step 3:** Verify script functionality.

---

## Final Verification & Council Review

- [ ] **Step 1:** Run project tests: `npm test`.
- [ ] **Step 2:** Run `/council:review` for external feedback.
- [ ] **Step 3:** Fix any high/medium priority issues from the review.
- [ ] **Step 4:** Final validation: `npm run lint && npm run build`.
