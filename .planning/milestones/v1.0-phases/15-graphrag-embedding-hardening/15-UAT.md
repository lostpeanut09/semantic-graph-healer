# Phase 15 UAT: GraphRAG & Embedding Hardening

| ID    | Test Case                                                           | Status | Result/Notes                                                                                    |
| ----- | ------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| UAT-1 | Embedding Config: Verify "Model Health" is STABLE in settings.      | PASSED | Implemented in `EmbeddingSettings.ts` and `EmbeddingService.ts`. Health status displayed in UI. |
| UAT-2 | Indexing: Verify `.planning/index/` contains AJSON artifacts.       | PASSED | Implementation verified in `GraphRagService.ts` and `GraphRagService.index.test.ts`.            |
| UAT-3 | Tribunal Hardening: Verify "Bypassed (Stage 0)" for low similarity. | PASSED | Implementation verified in `LlmService.ts` and `LlmService.prefilter.test.ts`.                  |
| UAT-4 | GraphRAG Query: Verify thematic query results in dashboard.         | PASSED | Implementation verified in `GraphRagService.ts` and `GraphRagService.query.test.ts`.            |
| UAT-5 | Cross-Thematic Links: Verify "Cross-Thematic Bridge" suggestions.   | PASSED | Implemented in `CrossThematicProvider.ts` using community embeddings.                           |
