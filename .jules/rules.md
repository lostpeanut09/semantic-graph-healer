# Project-Specific Review Rules for Google Jules

These rules are derived from project learnings and are to be enforced during Pull Request reviews.

## Performance: Graph Operations

- **Optimization**: In graph analysis hot loops, avoid JavaScript Array spreading (`[...set]`) for set intersections and unions to minimize garbage collection overhead.
- **Action**: Use manual loops over the smaller set for intersections. Use the inclusion-exclusion principle for union sizes.
- **Consistency**: Use ternary string concatenations instead of array sorting for consistent pair IDs.

## Accessibility: UI Components

- **ARIA Labels**: All search inputs and interactive fields must have an `aria-label`.
- **Busy States**: Async operations on buttons must utilize the `aria-busy` state to communicate loading status to screen readers.

## Security: Randomness and Identifiers

- **Cryptographic Security**: Do not use `Math.random()` for generating UUIDs or Batch IDs.
- **Action**: Always use `crypto.randomUUID()` via the `generateId` utility in `src/core/HealerUtils.ts`.
