## 2026-05-19 - [Memory Efficiency in Graph Set Operations]

**Learning:** [In graph algorithms handling dense nodes, using Array spreading (`[...set]`) for Set intersection and union computes large intermediate arrays, causing severe garbage collection overhead. Computing these dynamically via manual iteration over the smaller set significantly reduces memory footprint.]
**Action:** [Always avoid Array spreads (`[...set]`) for intermediate Set operations within hot loops or large graphs. Prioritize manual traversal over the smaller set for intersections, and the inclusion-exclusion formula for unions.]
