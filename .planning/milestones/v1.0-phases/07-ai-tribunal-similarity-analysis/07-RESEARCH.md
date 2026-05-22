# Phase 7: AI Tribunal & Similarity Analysis - Research

**Researched:** 2024-05-24
**Domain:** AI Consensus, LLM Integration, Graph Metrics Merging
**Confidence:** HIGH

## Summary

The AI Tribunal & Similarity Analysis phase introduces a dual-model LLM verification system and a blended scoring mechanism for recommendations. The system uses a Primary and Secondary model approach, where conflicts yield a "Low Confidence" / scored warning rather than suppressing the suggestion. Additionally, it implements Vector-Topological Merging (Harmonized Topological Ranking - HTR), giving priority to structural graph metrics while blending semantic vectors based on user-configurable weights.

**Primary recommendation:** Implement the tribunal logic directly within `LlmService.ts` for consensus, extending the `ReasoningResult` to include audit trails, and calculate HTR natively without heavy external libraries.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Dynamic Tribunal Selection:** Users must explicitly select their "Primary" and "Secondary" models from a detected list. Automatic heuristics (like "cheaper vs smarter") are disabled. The user has explicit control over which model plays which role, assuming they have checked and chosen the models themselves.
- **Consensus Algorithm & Conflict Resolution:** Conflicts between the primary and secondary models will not hide suggestions. Instead, they will be surfaced with a "Low Confidence" warning. Implementation will include levels of confidence (Low, Medium, High) or a 1-100 score that combines semantic search (embedding model) confidence and tribunal validation.
- **Vector-Topological Merging (Harmonized Topological Ranking - HTR):** Semantic vector scores and structural graph metrics will be averaged using user-configurable weights. Structural graph metrics (like Jaccard, Adamic-Adar) act as the priority baseline, blended with vector similarity according to the user's custom weight settings.
- **Uncertainty Triage Sensitivity:** The "Safe Zone" threshold (the confidence level at which the secondary model is skipped) is strictly user-configurable. We do not hardcode API cost-saving restrictions. Users will be informed of potential API usage and can adjust the threshold based on their own cost/accuracy preferences.
- **Tribunal UX & Audit Transparency:** The UI will provide full transparency. The Healing Dashboard will show both the final consolidated suggestion (the Verdict: Stable/Conflict) AND the individual reasoning of both the Primary and Secondary models.

### the agent's Discretion

None specified in CONTEXT.md.

### Deferred Ideas (OUT OF SCOPE)

None specified in CONTEXT.md.
</user_constraints>

<phase_requirements>

## Phase Requirements

| ID    | Description                            | Research Support                                            |
| ----- | -------------------------------------- | ----------------------------------------------------------- |
| AI-01 | Dual-model AI tribunal consensus logic | Implemented in LlmService with Uncertainty Triage patterns. |
| AI-03 | Similarity Analysis & HTR merging      | Combine Jaccard/Adamic-Adar with vector cosine similarity.  |

</phase_requirements>

## Architectural Responsibility Map

| Capability                       | Primary Tier     | Secondary Tier | Rationale                                                                           |
| -------------------------------- | ---------------- | -------------- | ----------------------------------------------------------------------------------- |
| Dynamic Tribunal Selection       | Frontend Server  | Settings UI    | Configures primary/secondary models via standard Obsidian settings interface.       |
| Consensus Algorithm & Resolution | API / Backend    | —              | Core logic for querying LLMs and establishing STABLE/CONFLICT states in LlmService. |
| Vector-Topological Merging (HTR) | API / Backend    | —              | Mathematics and weight combinations belong in the core graph algorithm layer.       |
| Uncertainty Triage Sensitivity   | API / Backend    | Settings UI    | The threshold is checked in LlmService, driven by user settings.                    |
| Tribunal UX & Audit Transparency | Browser / Client | —              | The frontend dashboard renders the audit trail and STABLE/CONFLICT UI states.       |

## Standard Stack

### Core

| Library          | Version  | Purpose           | Why Standard                                                                       |
| ---------------- | -------- | ----------------- | ---------------------------------------------------------------------------------- |
| Native Math / TS | (Native) | HTR Score Merging | Avoids bloating the plugin with heavy math libraries for simple weighted averages. |

### Supporting

| Library      | Version  | Purpose         | When to Use                                                                            |
| ------------ | -------- | --------------- | -------------------------------------------------------------------------------------- |
| Obsidian API | (Latest) | UI and Settings | Integrating the explicit primary/secondary dropdowns and rendering dashboard sections. |

### Alternatives Considered

| Instead of     | Could Use | Tradeoff                                                                                               |
| -------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| Native TS Math | Math.js   | Math.js provides more robust utilities but adds unnecessary bundle size for simple weighted averaging. |

**Installation:**

```bash
npm install
```

**Version verification:**

```bash
npm view obsidian version
```

## Architecture Patterns

### System Architecture Diagram

```
[Link Prediction Engine] --> (Calculates Structural Metrics)
       |
       v
[Vector Service] ----------> (Calculates Semantic Vector Scores)
       |
       v
(Weighted Merge: HTR) ---> [Candidate Suggestion]
       |
       v
[LlmService (Tribunal)] -> (Query Primary Model)
                               |
                        [Confidence > Safe Zone?] ---> (Yes: STABLE, return Verdict)
                               |
                             (No)
                               |
                        (Query Secondary Model)
                               |
                        [Compare Winners]
                               |
                        (Match: STABLE / Mismatch: CONFLICT)
                               |
       v
[DashboardView] <--------- (Render Verdict + Audit Trail)
```

### Recommended Project Structure

```
src/
├── core/               # LlmService, ReasoningService, LinkPredictionEngine
├── views/              # DashboardView, DashboardUI elements
└── views/sections/     # TribunalSettings, PrimaryModelSettings
```

### Pattern 1: Uncertainty Triage (Tribunal)

**What:** Only querying a secondary, potentially more expensive LLM, when the primary LLM falls below a certain confidence threshold.
**When to use:** In AI Tribunal consensus logic to save on API costs while retaining accuracy.
**Example:**

```typescript
// Source: Internal Planning
async function validateSuggestion(suggestion: any): Promise<ReasoningResult> {
    const primaryResult = await queryPrimary(suggestion);
    if (primaryResult.winnerScore >= settings.safeZoneThreshold) {
        primaryResult.tribunalStatus = TribunalStatus.STABLE;
        return primaryResult;
    }
    const secondaryResult = await querySecondary(suggestion);
    return evaluateConsensus(primaryResult, secondaryResult);
}
```

### Anti-Patterns to Avoid

- **Hardcoded Thresholds:** Do not hardcode the safe zone threshold. It must be user-configurable as per user constraints.
- **Hiding Conflict Data:** Do not discard the secondary model's reasoning if it disagrees. Store both in `ReasoningResult` so the UI can display the audit trail.

## Don't Hand-Roll

| Problem            | Don't Build                          | Use Instead                                | Why                                                                |
| ------------------ | ------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------ |
| Structural Metrics | Custom Graph Traversals from scratch | Re-use existing `TopologyAnalyzer` metrics | Ensure consistency in how Jaccard/Adamic-Adar scores are computed. |

## Common Pitfalls

### Pitfall 1: Type Mismatch in Model Settings

**What goes wrong:** Primary and Secondary models are configured, but the API keys or model names aren't correctly passed to the respective provider adapters.
**Why it happens:** Reusing a single provider setup logic instead of instantiating separate configurations.
**How to avoid:** Explicitly define `PrimaryProviderConfig` and `SecondaryProviderConfig` in settings.
**Warning signs:** Same model used twice or missing API keys.

### Pitfall 2: Confusing 0-1 vs 1-100 Scales

**What goes wrong:** HTR weighted averaging produces unexpected results because vector similarity is 0-1 and graph metrics are 1-100, or vice versa.
**Why it happens:** Lack of normalization before merging.
**How to avoid:** Normalize all scores to a standard 0-1 or 1-100 scale before applying the user-configurable weights.
**Warning signs:** Weights seem to have no effect.

## Code Examples

### Normalizing HTR Score

```typescript
// Source: Standard Math Approach
function calculateHTR(structuralScore: number, vectorScore: number, structuralWeight: number): number {
    const vectorWeight = 1.0 - structuralWeight;
    return structuralScore * structuralWeight + vectorScore * vectorWeight;
}
```

## State of the Art

| Old Approach | Current Approach  | When Changed | Impact                                              |
| ------------ | ----------------- | ------------ | --------------------------------------------------- |
| Single LLM   | Dual-LLM Tribunal | Phase 7      | Increased accuracy with Safe Zone gating for costs. |

## Assumptions Log

| #   | Claim                                        | Section        | Risk if Wrong                                                           |
| --- | -------------------------------------------- | -------------- | ----------------------------------------------------------------------- |
| A1  | No new heavy math dependencies are required. | Standard Stack | [ASSUMED] May need to re-evaluate if complex vector math is introduced. |

## Open Questions (RESOLVED)

1. **Dashboard space** (RESOLVED)
    - What we know: The UI needs to show both reasoning traces.
    - What's unclear: How much vertical space this will consume.
    - Recommendation: Use collapsible UI elements in the Dashboard for secondary reasonings.

## Environment Availability

| Dependency   | Required By   | Available | Version | Fallback             |
| ------------ | ------------- | --------- | ------- | -------------------- |
| Obsidian API | UI & Settings | ✓         | Latest  | —                    |
| LLM Provider | AI Tribunal   | ✓         | Varies  | Local model (Ollama) |

**Missing dependencies with no fallback:**

- None

**Missing dependencies with fallback:**

- None

## Validation Architecture

### Test Framework

| Property           | Value                                        |
| ------------------ | -------------------------------------------- |
| Framework          | vitest                                       |
| Config file        | `vitest.config.ts`                           |
| Quick run command  | `npx vitest run tests/core/{module}.test.ts` |
| Full suite command | `npm test`                                   |

### Phase Requirements → Test Map

| Req ID | Behavior                                             | Test Type | Automated Command                                        | File Exists? |
| ------ | ---------------------------------------------------- | --------- | -------------------------------------------------------- | ------------ |
| AI-01  | Dual-model AI tribunal consensus logic               | unit      | `npx vitest run tests/core/LlmService.test.ts`           | ✅ Wave 0    |
| AI-01  | Safe zone threshold prevents secondary call          | unit      | `npx vitest run tests/core/LlmService.test.ts`           | ✅ Wave 0    |
| AI-01  | Conflict returns both reasonings                     | unit      | `npx vitest run tests/core/LlmService.test.ts`           | ✅ Wave 0    |
| AI-03  | HTR weighted averaging of structural & vector scores | unit      | `npx vitest run tests/core/LinkPredictionEngine.test.ts` | ✅ Wave 0    |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/core/{module}.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- None — existing test infrastructure covers all phase requirements.

## Security Domain

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                   |
| --------------------- | ------- | ------------------------------------------------------------------ |
| V2 Authentication     | no      | —                                                                  |
| V3 Session Management | no      | —                                                                  |
| V4 Access Control     | no      | —                                                                  |
| V5 Input Validation   | yes     | Handle API errors gracefully; sanitize LLM outputs before display. |
| V6 Cryptography       | yes     | Securely access API keys via Obsidian's secret storage layer.      |

### Known Threat Patterns for LLM Integration

| Pattern          | STRIDE                 | Standard Mitigation                                                         |
| ---------------- | ---------------------- | --------------------------------------------------------------------------- |
| Prompt Injection | Tampering              | Sandbox execution, do not auto-execute output as code, sanitize UI display. |
| API Key Exposure | Information Disclosure | Store keys securely in `KeychainService` rather than plain settings.        |

## Sources

### Primary (HIGH confidence)

- `07-CONTEXT.md` - Locked Decisions

### Secondary (MEDIUM confidence)

- `docs/PLAN.md` - LlmService architecture.

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Native TS handles required computations efficiently.
- Architecture: HIGH - Fully aligned with locked decisions and Uncertainty Triage.
- Pitfalls: HIGH - Common issues with dual configurations and score normalizations are anticipated.

**Research date:** 2024-05-24
**Valid until:** 30 days
