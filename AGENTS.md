# Project Rules for AI Agents

These rules are foundational for the Semantic Graph Healer project. All AI agents (including Jules) must adhere to these standards during code generation and review.

## Git Privacy (Hermes)

- **Vulnerability:** Branch names, commit messages, and PR content leaking internal planning artifacts (phase numbers, plan IDs, internal tracking codes like WR-XX/CR-XX/IN-XX).
- **Prevention:** Before any push or PR creation, run `git log --oneline -i --grep="phase" --grep="WR-" --grep="CR-" --grep="IN-" --grep="G\d"` to detect leaks. Sanitize commit history with `python C:/Users/gabri/.gemini/tmp/semantic-graph-healer/sanitize_msg.py` via `git filter-branch --msg-filter`.
- **Branch naming:** Never include phase numbers, plan IDs, or wave numbers in branch names. Use descriptive technical names (e.g., `foundation/error-infrastructure`, not `phase-25-foundation`).
- **.planning/:** This directory is in `.gitignore`. Never force-add or commit its contents. It contains internal process artifacts that must remain local only.

## Security (Sentinel)

- **Vulnerability:** Use of non-cryptographic `Math.random()` for generating UUIDs/Batch IDs.
- **Prevention:** Always use `crypto.randomUUID()` via the `generateId` utility in `src/core/HealerUtils.ts`. Reject any use of `Math.random()`.

## Performance (Bolt)

- **Learning:** Using JavaScript Array spreading (`[...set]`) for Set operations in hot loops causes high GC pressure.
- **Action:** Replace spreading/filtering with manual loops over the smaller set for intersections. Use the inclusion-exclusion principle (`|A| + |B| - |A ∩ B|`) for union sizes.

## Accessibility (Palette)

- **Learning:** Screen readers require explicit context for inputs and loading states.
- **Action:** Always attach `aria-label` to search inputs. Ensure dynamic buttons tracking async loading states utilize the `aria-busy` attribute.
