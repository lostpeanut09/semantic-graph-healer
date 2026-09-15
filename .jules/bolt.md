## 2025-01-29 - Avoid Intermediate Sets in Graph Traversal

**Learning:** In highly nested loops (like O(V^2) similarity analysis over node neighbors), allocating intermediate `Set` instances for computing set intersections causes significant memory overhead and garbage collection pauses, which tanks performance on large graphs.
**Action:** Instead of accumulating intersections into a new `Set` and iterating multiple times, compute the intersection properties (like size, degree-based metrics like Adamic-Adar and Resource Allocation) on-the-fly during a single iteration over the smaller of the two sets.
