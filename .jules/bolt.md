## 2023-10-27 - Optimize Similarity Analysis Loop

**Learning:** Allocating intermediate `Set` instances to hold intersections in highly nested (O(V^2)) graph algorithm loops causes significant memory overhead and garbage collection pauses.
**Action:** Avoid intermediate `Set` allocations. Compute intersection size and required metrics (like Adamic-Adar and RA) on-the-fly by iterating directly over the smaller set in a single pass.
