# Project Rules for AI Agents

These rules are foundational for the Semantic Graph Healer project. All AI agents (including Jules) must adhere to these standards during code generation and review.

## Security (Sentinel)
- **Vulnerability:** Use of non-cryptographic `Math.random()` for generating UUIDs/Batch IDs.
- **Prevention:** Always use `crypto.randomUUID()` via the `generateId` utility in `src/core/HealerUtils.ts`. Reject any use of `Math.random()`.

## Performance (Bolt)
- **Learning:** Using JavaScript Array spreading (`[...set]`) for Set operations in hot loops causes high GC pressure.
- **Action:** Replace spreading/filtering with manual loops over the smaller set for intersections. Use the inclusion-exclusion principle (`|A| + |B| - |A ∩ B|`) for union sizes.

## Accessibility (Palette)
- **Learning:** Screen readers require explicit context for inputs and loading states.
- **Action:** Always attach `aria-label` to search inputs. Ensure dynamic buttons tracking async loading states utilize the `aria-busy` attribute.
