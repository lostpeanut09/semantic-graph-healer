## 2024-08-11 - Reduce Memory Overhead in O(V^2) Loops
**Learning:** In highly nested (e.g., O(V^2)) graph algorithm loops, allocating intermediate `Set` instances for set intersections causes significant memory overhead and garbage collection pauses.
**Action:** Avoid intermediate `Set` allocations. Instead, iterate directly over the smaller set to find intersections and compute required metrics (like shared size, adamicAdar, and ra) on-the-fly in a single pass.
