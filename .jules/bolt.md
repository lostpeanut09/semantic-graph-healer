## 2024-05-20 - Set Operations in Graph Analysis Hot Loops
**Learning:** Using array spreading (`[...set]`) to compute set intersections and unions inside highly nested loops (e.g., node pairwise similarity and co-citation analysis) causes massive memory allocation and garbage collection churn, severely degrading performance on large graphs.
**Action:** Always compute Set intersections by manually iterating over the smaller set. Compute Set unions mathematically using the inclusion-exclusion principle (`|A| + |B| - |A ∩ B|`) to eliminate O(N) allocations entirely in hot paths.
