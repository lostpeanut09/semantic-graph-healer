## 2024-05-24 - [Optimizing Set Operations in Graph Algorithms]

**Learning:** Array spreading (`[...set]`) and Set construction from arrays are memory-intensive and slow down graph analysis loops significantly. Also, `[a, b].sort().join("|||")` is an expensive way to generate unique pair identifiers.
**Action:** Use manual iteration over the smaller Set for intersections. Use the inclusion-exclusion formula (`|A| + |B| - |A ∩ B|`) for unions. Use a ternary operator (`a < b ? \`${a}|||${b}\` : \`${b}|||${a}\``) for sorted string concatenation.
