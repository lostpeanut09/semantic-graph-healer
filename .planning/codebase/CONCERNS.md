# Architectural Concerns: Semantic Graph Healer

## Security & Privacy

- **LLM Data Exfiltration**: Risk of sending sensitive vault content to cloud AI providers. Mitigation: Opt-in per-folder scanning and local-first Llama integration.
- **Keychain Resilience**: The `KeychainService` depends on Obsidian's secure storage. Fallbacks for environments where this is restricted must be carefully managed to avoid plaintext storage.

## Technical Debt

- **main.ts Bloat**: The entry point is currently a monolith orchestrating too many services. Refactoring into a more granular `PluginContext` or `ServiceRegistry` is recommended.
- **Circular Dependencies**: Runtime cycles between `main` and `views` have been addressed with `import type`, but deeper structural decoupling is needed.
- **Adapter Fragility**: Changes in the external APIs of Datacore or Breadcrumbs can break the ingestion layer. Continuous integration testing is vital.

## Performance

- **Large Vault Scalability**: Graphs with >10k nodes may lag during real-time synchronization. The `workerTimeout` and node limits must be monitored.
- **Memory Usage**: The `graphology` instance in the worker can consume significant memory on very dense graphs.

## Robustness

- **Silent Data Loss**: Previously identified issue with Zod's `strip` behavior now mitigated by `looseObject`. Continuous audit of schema drift is necessary.
