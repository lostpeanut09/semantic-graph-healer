# Conventions: Semantic Graph Healer

## TypeScript & Naming

- **Strict Types**: Always use explicit types or interfaces; avoid `any`.
- **Naming**: PascalCase for classes and types, camelCase for methods and variables.
- **Service Pattern**: Business logic is encapsulated in singleton services injected into `main.ts`.

## Error Handling

- **Safe Execution**: Critical calls (like metadata fetching) must use the `safeExecute` or `safeExecuteAsync` pattern found in `UnifiedMetadataAdapter.ts`.
- **Fail-Closed**: If a data source is corrupted or unavailable, the system should halt the specific operation rather than proceeding with partial/dirty data.
- **Logging**: Use the centralized `HealerLogger` with appropriate log levels (`debug`, `info`, `warn`, `error`).

## Persistency (The "Zod Guard")

- All settings must be validated through `SettingsSchema` in `types.schema.ts`.
- Prefer `z.looseObject()` for settings that may contain encrypted keys to prevent silent data loss during re-parsing.

## Async & Concurrency

- Long-running tasks must be delegated to workers.
- Avoid race conditions by using the `CacheService` atomic write patterns.
