# Phase 7: AI Tribunal & Similarity Analysis Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the AI Tribunal (dual-LLM consensus) core logic in LlmService and dynamic similarity analysis.

**Architecture:** Use an "Uncertainty Triage" pattern where a secondary LLM is called only if the primary model's confidence is below a user-configurable "Safe Zone" threshold. Semantic vector scores and structural graph metrics will be merged using a user-configurable Harmonized Topological Ranking (HTR) weight.

**Tech Stack:** TypeScript, Obsidian API (SecretStorage), Vitest.

---

### Acceptance Criteria
- Users can explicitly select "Primary" and "Secondary" models.
- Conflicts between models surface suggestions with a "Low Confidence" warning.
- "Safe Zone" threshold is user-configurable.
- HTR weight is user-configurable to blend semantic and structural scores.
- UI provides full transparency of primary and secondary model reasoning.

### Testing
Command: `npx vitest run`