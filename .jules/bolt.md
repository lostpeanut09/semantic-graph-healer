## 2026-05-16 - Array Spreading for Sets is O(N) memory allocation

**Learning:** In hot loops within graph algorithms (`src/core/workers/graph-analysis-core.ts`), using Array spreading `[...set]` to compute intersections or unions creates temporary arrays, adding O(N) memory overhead and triggering heavy garbage collection.
**Action:** Replace `new Set([...A].filter(x => B.has(x)))` with manual iteration over the smaller set. Replace Set unions with mathematical inclusion-exclusion `|A| + |B| - |A ∩ B|`.
