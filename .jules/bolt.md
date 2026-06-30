## 2024-06-30 - Avoid Set Allocations for Graph Metric Computations
**Learning:** In highly nested (O(V^2)) graph algorithm loops like similarity analysis, allocating intermediate Sets for intersections causes severe memory overhead and garbage collection pauses.
**Action:** When computing metrics like Adamic-Adar or Resource Allocation on intersections, iterate directly over the smaller set and compute the required values on the fly instead of building and then iterating over an intermediate Set.
