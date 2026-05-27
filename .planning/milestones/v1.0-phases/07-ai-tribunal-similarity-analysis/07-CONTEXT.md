# Phase 7 Context & Decisions: AI Tribunal & Similarity Analysis

This document captures the implementation decisions for Phase 7, ensuring downstream planners and executors understand the chosen architecture and user preferences.

## 1. Dynamic Tribunal Selection

- **Decision:** Users must explicitly select their "Primary" and "Secondary" models from a detected list.
- **Rationale:** Automatic heuristics (like "cheaper vs smarter") are disabled. The user has explicit control over which model plays which role, assuming they have checked and chosen the models themselves.

## 2. Consensus Algorithm & Conflict Resolution

- **Decision:** Conflicts between the primary and secondary models will not hide suggestions. Instead, they will be surfaced with a "Low Confidence" warning.
- **Confidence Scoring:** Implementation will include levels of confidence (Low, Medium, High) or a 1-100 score that combines semantic search (embedding model) confidence and tribunal validation.

## 3. Vector-Topological Merging (Harmonized Topological Ranking - HTR)

- **Decision:** Semantic vector scores and structural graph metrics will be averaged using user-configurable weights.
- **Priority:** Structural graph metrics (like Jaccard, Adamic-Adar) act as the priority baseline, blended with vector similarity according to the user's custom weight settings.

## 4. Uncertainty Triage Sensitivity

- **Decision:** The "Safe Zone" threshold (the confidence level at which the secondary model is skipped) is strictly user-configurable.
- **Rationale:** We do not hardcode API cost-saving restrictions. Users will be informed of potential API usage and can adjust the threshold based on their own cost/accuracy preferences.

## 5. Tribunal UX & Audit Transparency

- **Decision:** The UI will provide full transparency.
- **Display:** The Healing Dashboard will show both the final consolidated suggestion (the Verdict: Stable/Conflict) AND the individual reasoning of both the Primary and Secondary models.

---

_Generated during Phase 7 Discussion Mode._
