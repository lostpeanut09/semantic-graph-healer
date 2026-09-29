## 2025-02-14 - Optimize Object iteration over resolvedLinks

**Learning:** Iterating over large graph structures (like Obsidian's `resolvedLinks`) using `Object.entries()`, `Object.keys()`, or `Object.values()` causes significant O(N) memory allocation and GC pauses.
**Action:** Use `for...in` loops to iterate directly over the object properties to avoid unnecessary object allocations.
