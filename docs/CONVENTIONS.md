<!-- generated-by: gsd-doc-writer -->

# Coding Conventions and Standards

This document outlines the established coding standards, naming conventions, and project-specific patterns for the **Semantic Graph Healer** Obsidian plugin. All contributions should adhere to these guidelines to ensure codebase consistency, security, and performance.

## 1. Directory Structure

The project follows a modular structure that separates core logic from the UI layer:

- `src/core/`: Contains the business logic, services, and infrastructure adapters.
    - `adapters/`: Concrete implementations of external integrations (Dataview, Datacore, etc.).
    - `ports/`: Interfaces defining the contracts for adapters.
    - `services/`: Core application services (LLM, GraphEngine, Keychain).
    - `utils/`: Shared utility functions and classes.
    - `workers/`: Background worker logic (Web Workers).
- `src/views/`: Contains UI components and view logic.
    - `components/`: Shared Svelte and Obsidian UI components.
    - `dashboard/`: Logic and components specific to the Dashboard view.
    - `sections/`: Settings tab sections.
- `tests/`: Test suite following a similar structure to `src/`.

## 2. Naming Conventions

### Files and Classes

- **PascalCase**: Used for all class files, services, adapters, and UI components (e.g., `GraphEngine.ts`, `CacheService.ts`, `DashboardView.ts`).
- **kebab-case**: Used for Web Worker files and scripts (e.g., `graph-analysis-worker.ts`).
- **Interfaces**:
    - Internal API abstractions are prefixed with `I` (e.g., `IDataviewPort.ts`, `IMetadataAdapter.ts`).
    - Standard data types and settings interfaces do NOT use the `I` prefix (e.g., `Suggestion`, `SemanticGraphHealerSettings`).

### Methods and Variables

- **camelCase**: Used for method names, variables, and property keys.
- **Private Fields**: Use the native `#` prefix for private class fields, especially in Svelte stores and core services (e.g., `#suggestions`, `#plugin`).

## 3. Strict Types and Code Patterns

### TypeScript Strict Mode

The project leverages a strict configuration in `tsconfig.json` to prevent runtime errors:

- **`noImplicitAny: true`**: Do not use implicit `any`. Always type variables explicitly if they cannot be inferred.
- **`strictNullChecks: true`**: Handle `null` and `undefined` explicitly.

### Avoid `any`

While `eslint` rules currently warn on `any` (`@typescript-eslint/no-explicit-any`), the intent is to eliminate its use entirely. Whenever possible, use `unknown` if the type is truly dynamic, followed by Zod schemas or type guards to validate the shape.

### Architectural Patterns

#### Port/Adapter (Hexagonal Architecture)

The project utilizes a Port/Adapter pattern to decouple core logic from external dependencies (Obsidian API, third-party plugins).

- Core services should depend on **Ports** (interfaces) located in `src/core/ports/`.
- Concrete implementations are located in `src/core/adapters/`.

#### Dependency Injection

- Service instantiation and dependency wiring happen in the `onload` method of `src/main.ts` (the Composition Root).
- Avoid hardcoding singleton access; prefer passing dependencies via constructors.

#### Service-Oriented Logic

- Logic is encapsulated in **Services** (e.g., `LlmService`, `EmbeddingService`).
- Services are typically instantiated once and held by the main plugin instance.

## 4. UI Development (Svelte 5)

### Svelte 5 Runes

The project uses Svelte 5 and its "Runes" system for reactivity:

- Use `$state` for reactive variables.
- Use `$derived` for computed values.
- Use `$effect` for side effects.

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

### Safety Timeouts

All critical async operations (especially those involving LLMs or file I/O) should implement a safety timeout to prevent "Head-of-Line" blocking:

```typescript
const result = await Promise.race([
    this.innerExecute(suggestion),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000)),
]);
```

### Abort Controllers

Use `AbortController` for cancellable operations, such as long-running graph analyses.

### Error Handling

- Use `try-catch` blocks for all external API calls and file operations.
- Errors should be logged via `HealerLogger` and, if appropriate, reported to the user via a `Notice`.
- **No Floating Promises**: Always `await` or `void` promises to ensure proper error handling (enforced by `@typescript-eslint/no-floating-promises`).

## 6. Logging and Security

### HealerLogger

Always use the `HealerLogger` instead of `console.log`. It provides:

- **Masking**: Automatically redacts sensitive keys (API keys, tokens, passwords).
- **Sanitization**: Neutralizes control characters to prevent log injection.
- **Rotation**: Caps log files at 2MB to prevent vault bloat.

### Information Disclosure (T-10-04)

- Never log raw content from user notes without sanitizing for sensitive patterns.
- Ensure that Bearer tokens and JWTs are masked before logging.

## 7. Obsidian API Best Practices

- **Type Guards**: Use `instanceof TFile` or `instanceof TFolder` before accessing file-specific properties.
- **Metadata Cache**: Prefer `app.metadataCache` for reading file links and frontmatter efficiently.
- **Frontmatter Updates**: Use `app.fileManager.processFrontMatter` for atomic and safe metadata modifications.
- **Path Normalization**: Use `normalizePath` from Obsidian for all file paths.

## 8. Coding Standards (ESLint & Prettier)

The project enforces strict linting and formatting rules via ESLint, Prettier, and Stylelint. These are checked on commit using `husky` and `nano-staged`.

### Prettier (Styling)

Configuration is managed in `.config/.prettierrc`. Key styling rules include:

- **Indentation**: 4 spaces (`tabWidth: 4`).
- **Quotes**: Single quotes (`singleQuote: true`).
- **Line Length**: 120 characters (`printWidth: 120`).
- **Semicolons**: Always required (`semi: true`).
- **Trailing Commas**: Required everywhere (`trailingComma: "all"`).

### ESLint

Configuration is managed in `.config/eslint.config.js`. Key rules include:

- **Type-Checked Rules**: Full TypeScript strict checking via `@typescript-eslint`.
- **obsidianmd/no-tfile-tfolder-cast**: Do not cast abstract files to `TFile`/`TFolder`; use type guards (`error`).
- **obsidianmd/ui/sentence-case**: Use sentence case for UI labels (`warn`).
- **obsidianmd/no-static-styles-assignment**: Prevents unsafe style mutation (`error`).
- **No `console`**: Banned standard logging in favor of `HealerLogger`. Only `console.warn`, `error`, `debug`, and `info` are permitted as fallbacks.

To run the linters and formatters manually:

```bash
# Format code using Prettier
npm run format

# Run ESLint and Stylelint
npm run lint

# Automatically fix linting and formatting issues
npm run lint:fix
```
