## 2024-05-18 - Avoid Memory-Intensive Set Operations

**Learning:** Spread syntax with new Set (`new Set([...a, ...b])`) is O(N+M) and creates temporary arrays, causing memory churn especially in hot loops like graph analysis.
**Action:** Use manual inclusion-exclusion `|A| + |B| - |A ∩ B|` instead of Set unions when possible. For intersections (`new Set([...a].filter(x => b.has(x)))`), iterate over the smaller set to reduce iterations.
