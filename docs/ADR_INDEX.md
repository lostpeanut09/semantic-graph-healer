# Architecture Decision Records (ADR) Index

This document tracks the foundational architectural decisions for Semantic Graph Healer v1.

| ADR     | Title                                | Status   | Strategy                                                 |
| :------ | :----------------------------------- | :------- | :------------------------------------------------------- |
| ADR-001 | **Datacore as Primary Engine**       | Accepted | Reactive, high-speed metadata querying.                  |
| ADR-002 | **Web Worker Analysis**              | Accepted | Offloading heavy Graphology math to background threads.  |
| ADR-003 | **AI Tribunal Pattern**              | Accepted | Dual-LLM consensus for hallucination prevention.         |
| ADR-004 | **Adaptive Safety Mode**             | Accepted | Threshold-based LOD rendering and analysis throttling.   |
| ADR-005 | **Svelte 5 for Dashboard**           | Accepted | Utilizing runes for high-performance reactive UI state.  |
| ADR-006 | **3D Force Graph for Visualization** | Accepted | WebGL-based rendering for large-scale graph interaction. |
| ADR-007 | **Keychain Service**                 | Accepted | Defense-in-depth credential management.                  |

---

_For detailed research on these decisions, see `.planning/research/ARCHITECTURE.md`._
