# Tech Stack: Semantic Graph Healer

## Core Technologies

- **Language**: TypeScript 5.x
- **Framework**: Obsidian Plugin API
- **Module System**: ESM (Source) / CJS & IIFE (Build)
- **Styling**: Vanilla CSS (`styles.css`)

## Graph Analysis

- **Graphology**: Core graph engine for topological analysis.
- **Algorithms**: Community detection (Louvain), Degree centrality, PageRank, Co-citation analysis.

## Build & Tooling

- **Bundler**: Esbuild (custom `.config/esbuild.config.mjs`)
- **Testing**: Vitest (`vitest.config.ts`, `tests/` directory)
- **Formatting**: Prettier
- **Linting**: ESLint (Obsidian ruleset)
- **Git Hooks**: Husky + Nano-staged

## Major Dependencies

- `graphology`, `graphology-metrics`, `graphology-communities-louvain`
- `zod` (Settings validation)
- `obsidian`, `obsidian-typings`
- `vitest`, `jsdom` (Test environment)
