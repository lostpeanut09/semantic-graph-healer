# Structure: Semantic Graph Healer

## Directory Overview

- **.config/**: Esbuild, ESLint, and Prettier configurations.
- **.planning/**: GSD workflow documents (PROJECT, ROADMAP, STATE).
- **.agent/**: Local agent skills and workflows.
- **src/**: Principal source directory.
    - **core/**: Services, adapters, and business logic.
        - **adapters/**: Bridges for external metadata sources (Datacore, Breadcrumbs).
        - **services/**: Keychain, Cache, and Worker management.
        - **workers/**: Core analysis logic meant for the background thread.
        - **utils/**: Logging and cryptographic helpers.
    - **views/**: Obsidian UI components (Dashboard, Settings).
- **tests/**: Vitest suite mirroring the `src/` hierarchy.
- **dist/**: Compiled artifacts (`main.js`, `manifest.json`, `styles.css`).

## Key Files

- `src/main.ts`: Plugin entry point and service orchestration.
- `src/types.ts`: Domain models and settings defaults.
- `src/types.schema.ts`: Zod validation layer for data persistence.
- `styles.css`: Visual styling for the Dashboard.
