## 2026-05-21 - Set Intersection Memory Leak Pattern

**Learning:** Using `[...set].filter()` for set intersections creates massive GC pressure during O(N^2) graph algorithms like co-citation and similarity analysis. Creating arrays and then sets for unions `new Set([...a, ...b]).size` is also extremely slow.
**Action:** Always manually iterate over the smaller set for intersections, and use the inclusion-exclusion formula (`|A| + |B| - |A ∩ B|`) for unions.
