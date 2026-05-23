## 2024-05-23 - [String Concatenation Over Array Sort]

**Learning:** In hot loops, particularly O(N^2) loops during graph analysis, creating ad-hoc arrays and using `.sort().join()` to compute symmetric keys (e.g. `[a, b].sort().join('::')`) causes massive, unnecessary array allocation and garbage collection overhead.
**Action:** Use a direct ternary string interpolation `a < b ? \`${a}::${b}\` : \`${b}::${a}\`` to prevent allocations and dramatically improve performance.
