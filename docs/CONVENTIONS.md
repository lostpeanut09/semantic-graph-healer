<!-- generated-by: gsd-doc-writer -->

# Coding Conventions and Standards

This document outlines the established coding standards, naming conventions, and project-specific patterns for the **Semantic Graph Healer** Obsidian plugin. All contributions should adhere to these guidelines to ensure codebase consistency, security, and performance.

## 1. Directory Structure

The project follows a modular structure that separates core logic from the UI layer:

- `src/core/`: Contains the business logic, services, and infrastructure adapters.
    - `adapters/`: Concrete implementations of external integrations (Dataview, Datacore, etc.).
    - `ports/`: Interfaces defining the contracts for adapters.
    - `services/`: Core application services (LLM, GraphEngine, Keychain).
    - `utils/`: Shared utility functions and classes (e.g., `HealerLogger`, `AjsonStorage`).
    - `workers/`: Background worker logic (Web Workers).
- `src/views/`: Contains UI components and view logic.
    - `components/`: Shared Svelte and Obsidian UI components.
    - `dashboard/`: Logic and components specific to the Dashboard view.
    - `sections/`: Settings tab sections.
- `tests/`: Test suite following a similar structure to `src/`.

## 2. Naming Conventions

### Files and Classes

- **PascalCase**: Used for all class files, services, adapters, and UI components (e.g., `GraphEngine.ts`, `CacheService.ts`, `DashboardView.ts`).
- **kebab-case**: Used for Web Worker files and scripts (e.g., `graph-analysis-worker.ts`, `extract-audit-findings.py`).
- **Interfaces**:
    - Internal API abstractions are prefixed with `I` (e.g., `IDataviewPort.ts`, `IMetadataAdapter.ts`).
    - Standard data types and settings interfaces do NOT use the `I` prefix (e.g., `Suggestion`, `SemanticGraphHealerSettings`).

### Methods and Variables

- **camelCase**: Used for method names, variables, and property keys.
- **Private Fields**: Use the native `#` prefix for private class fields where appropriate, especially in Svelte stores and core services, to ensure true encapsulation.

## 3. Strict Types and Code Patterns

### TypeScript Strict Mode

The project leverages a strict configuration in `tsconfig.json` to prevent runtime errors:

- **`noImplicitAny: true`**: Do not use implicit `any`. Always type variables explicitly if they cannot be inferred.
- **`strictNullChecks: true`**: Handle `null` and `undefined` explicitly.

### Handling `any`

While `eslint` rules currently warn on `any` (`@typescript-eslint/no-explicit-any`), the intent is to minimize its use. For Release V1.5.0, some strict type-checking rules are downgraded to `warn` to facilitate rapid iteration, but production-grade code should aim for zero warnings.

### Architectural Patterns

#### Port/Adapter (Hexagonal Architecture)

The project utilizes a Port/Adapter pattern to decouple core logic from external dependencies (Obsidian API, third-party plugins).

- Core services should depend on **Ports** (interfaces) located in `src/core/ports/`.
- Concrete implementations are located in `src/core/adapters/`.

#### Dependency Injection (Composition Root)

- Service instantiation and dependency wiring happen in the `onload` method of `src/main.ts`.
- Avoid hardcoding singleton access; dependencies are passed via constructors to facilitate testing and modularity.

#### Service-Oriented Logic

- Logic is encapsulated in **Services** (e.g., `LlmService`, `EmbeddingService`).
- Services are typically instantiated once and held by the main plugin instance.

## 4. UI Development (Svelte 5)

### Svelte 5 Runes

The project uses Svelte 5 and its "Runes" system for reactivity. Runes are globally available in the project's ESLint configuration:

- Use `$state` for reactive variables.
- Use `$derived` for computed values.
- Use `$effect` for side effects.
- Use `$props`, `$inspect`, `$host`, and `$bindable` for component-level logic.

### Store-View Separation

- **Stores**: Business logic for views is encapsulated in `.svelte.ts` files (e.g., `DashboardStore.svelte.ts`). Stores handle state management and service calls.
- **Views**: `.svelte` files focus on presentation and user interaction, delegating logic to stores.

### UI Performance

- **Yielding Loops**: When performing batch operations (e.g., fixing multiple suggestions), yield the main thread using a small timeout to keep the UI responsive:
    ```typescript
    if (count % 5 === 0) {
        await new Promise((r) => setTimeout(r, 0));
    }
    ```

## 5. Async and Error Handling

### Safety Timeouts and Abort Controllers

- **Safety Timeouts**: Critical async operations (especially LLM calls or file I/O) should implement safety timeouts to prevent blocking.
- **Abort Controllers**: Use `AbortController` for cancellable operations, such as long-running graph analyses or LLM queries.

### Error Handling Patterns

- Use **Custom Errors** for domain-specific failures (e.g., `LlmError`).
- Use `try-catch` blocks for all external API calls and file operations.
- Errors should be logged via `HealerLogger` and, if appropriate, reported to the user via a `Notice`.
- **Retry Logic**: Critical services like `LlmService` implement retry logic for transient failures (e.g., 429, 408, 503 status codes).

## 6. Logging and Security

### HealerLogger

Always use the `HealerLogger` instead of `console.log`. It is configured to:

- **Redact Sensitive Information**: Automatically masks keys like `apikey`, `token`, `password`, and Bearer/JWT patterns.
- **Neutralize Injection**: Sanitizes control characters (ASCII 0x00-0x1F) to prevent log injection attacks.
- **Log Rotation**: Caps log files (default 2MB) to prevent vault bloat.
- **Module Context**: Each logger instance is tied to a specific module for better traceability.

### Information Disclosure

- Never log raw content from user notes without sanitization.
- Ensure that Bearer tokens and JWTs are masked before logging (handled automatically by `HealerLogger`).

## 7. Obsidian API Best Practices

- **Type Guards**: Use `instanceof TFile` or `instanceof TFolder` before accessing file-specific properties.
- **Metadata Cache**: Prefer `app.metadataCache` for reading file links and frontmatter efficiently.
- **Frontmatter Updates**: Use `app.fileManager.processFrontMatter` for atomic and safe metadata modifications.
- **Path Normalization**: Use `normalizePath` from Obsidian for all file paths.

## 8. Coding Standards (ESLint & Prettier)

The project enforces strict linting and formatting rules.

### Prettier (Styling)

Managed in `.config/.prettierrc`:

- **Indentation**: 4 spaces (`tabWidth: 4`).
- **Quotes**: Single quotes (`singleQuote: true`).
- **Line Length**: 120 characters (`printWidth: 120`).
- **Semicolons**: Required (`semi: true`).
- **Trailing Commas**: Required everywhere (`trailingComma: "all"`).
- **Arrow Parens**: Always include parentheses (`arrowParens: "always"`).

### ESLint

Managed in `.config/eslint.config.js`:

- **Type-Checked Rules**: Uses `@typescript-eslint/recommended-type-checked`.
- **Obsidian Best Practices**:
    - `obsidianmd/no-tfile-tfolder-cast`: Prevents unsafe casting (`error`).
    - `obsidianmd/ui/sentence-case`: Ensures UI labels follow sentence case (`warn`).
    - `obsidianmd/no-static-styles-assignment`: Prevents unsafe style mutation (`error`).
- **Logging**: `no-console` is a warning; only `warn`, `error`, `debug`, and `info` are permitted as fallbacks to `HealerLogger`.
- **Release V1.5.0 Relaxations**: Some strict rules (like `no-floating-promises`, `no-explicit-any`, `no-unsafe-assignment`) are currently set to `warn` to accommodate the current development phase.

To run checks manually:

```bash
# Format code
npm run format

# Run linting
npm run lint

# Fix automatic issues
npm run lint:fix
```
