<!-- generated-by: gsd-doc-writer -->

# Contributing to Semantic Graph Healer

Thank you for your interest in contributing to Semantic Graph Healer! We welcome all contributions that help improve the topological integrity of knowledge graphs in Obsidian.

## Development Setup

See **[GETTING-STARTED.md](docs/GETTING-STARTED.md)** for prerequisites and first-run instructions, and **[DEVELOPMENT.md](docs/DEVELOPMENT.md)** for detailed local development setup.

## Coding Standards

- We use **ESLint** for static analysis and **Prettier** for code formatting.
- All new code must be written in **TypeScript** and pass existing linting rules.
- Run `npm run lint` and `npm run format` before committing.
- Documentation should be updated in the `docs/` directory for any significant architectural changes.

## PR Guidelines

- **Branches**: Prefix your branch name with `feat/`, `fix/`, or `docs/`.
- **Commit Messages**: Follow [Conventional Commits](https://www.conventionalcommits.org/) format.
- **Tests**: Every pull request must include tests for new functionality or bug fixes.
- **Review**: At least one maintainer must review and approve your PR before it is merged.
- **CI**: All GitHub Action checks (Build, Lint, Test) must pass.

## Issue Reporting

- Use the **[Bug Report](https://github.com/lostpeanut09/semantic-graph-healer/issues/new?template=bug_report.md)** template for reporting errors.
- Use the **[Feature Request](https://github.com/lostpeanut09/semantic-graph-healer/issues/new?template=feature_request.md)** template for suggesting new capabilities.
- Always include steps to reproduce, expected behavior, and your Obsidian environment details.

## Code of Conduct

Please be respectful and constructive in all interactions within this project. We aim to foster a welcoming and inclusive community.
