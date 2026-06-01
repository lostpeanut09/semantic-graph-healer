<!-- generated-by: gsd-doc-writer -->

Thank you for your interest in contributing to Semantic Graph Healer! We welcome all contributions that help improve the topological integrity of knowledge graphs in Obsidian.

## Development Setup

Before you start contributing, please ensure your local environment is set up correctly:

- See **[GETTING-STARTED.md](docs/GETTING-STARTED.md)** for initial prerequisites and first-run instructions.
- See **[DEVELOPMENT.md](docs/DEVELOPMENT.md)** for a detailed local development guide, including build commands and project structure.

## Coding Standards

To maintain codebase consistency and quality, we enforce the following standards:

- **TypeScript & Svelte 5**: All new functionality must be written in TypeScript. We use Svelte 5 and its **Runes** system (`$state`, `$derived`, `$effect`) for UI reactivity.
- **Linting & Formatting**: CI enforces the following checks:
    - **ESLint**: Used for static analysis of TypeScript and JavaScript. Run `npm run lint`.
    - **Prettier**: Used for consistent code formatting. Run `npm run format`.
    - **Stylelint**: Used for CSS linting. Run `npm run lint:css`.
- **Architecture**: We follow a **Port/Adapter (Hexagonal)** architecture. Core logic should be decoupled from external dependencies via interfaces in `src/core/ports/`.
- **Logging**: Always use `HealerLogger` instead of `console.log` to ensure proper redaction of sensitive data and consistent formatting.
- **Documentation**: For more detailed coding patterns and naming conventions, refer to **[docs/CONVENTIONS.md](docs/CONVENTIONS.md)**.

## PR Guidelines

When submitting a Pull Request, please follow these guidelines:

- **Branch Naming**: Prefix your branch name based on the type of change: `feat/feature-name`, `fix/bug-name`, or `docs/doc-update`.
- **Commit Messages**: Follow [Conventional Commits](https://www.conventionalcommits.org/) (e.g., `feat: add new graph analyzer`, `fix: resolve memory leak in worker`). **Important:** Commit messages MUST NOT reference internal planning artifacts, phases, or specific files within the `.planning/` directory (e.g., "phase-19", "PLAN.md"). Ensure commits focus solely on the technical or functional change and remove any workflow-specific tags.
- **Tests**: Every pull request should include tests for new functionality or bug fixes. Use `npm run test` to verify your changes.
- **Quality Pipeline**: All PRs must pass the GitHub Actions quality pipeline, which includes:
    - Prettier check
    - ESLint (TS/JS)
    - Stylelint (CSS)
    - Knip (dependency audit)
    - Full test suite
    - Build check
- **Review**: All contributions require a review and approval from a project maintainer before merging.

## Issue Reporting

If you encounter a bug or have a feature request, please open an issue on GitHub:

- **Bug Reports**: Include a clear description of the issue, steps to reproduce, expected behavior, and actual behavior. Please also include your Obsidian version and environment details.
- **Feature Requests**: Describe the proposed feature, the problem it solves, and any potential alternatives you've considered.

We value your time and contributions! If you have any questions, feel free to reach out via GitHub Issues.
