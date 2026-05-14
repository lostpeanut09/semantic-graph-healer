## 2024-05-14 - Optimizing Set Intersections in Graph Algorithms

**Learning:** In graph algorithms with high connection density (like similarity and co-citation analysis), using Array spreading to compute Set intersections (`[...setA].filter(x => setB.has(x))`) creates severe O(N) memory allocation bottlenecks. In hot loops, this rapidly degrades performance and triggers frequent garbage collection.
**Action:** When computing Set intersections or unions, avoid spreading Sets into Arrays. For intersections, manually iterate over the smaller Set and add matching items to a new Set (or just increment a counter). For unions, use the inclusion-exclusion formula (`sizeA + sizeB - intersectionSize`) to calculate the size in O(1) without allocating a new Set.
