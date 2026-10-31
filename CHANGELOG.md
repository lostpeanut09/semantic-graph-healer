# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Complete development toolchain: esbuild 0.28.2 bundler, TypeScript 5.9.3 strict-mode compiler, vitest 5.0.5 test runner with jsdom, ESLint 9.39.5 with typescript-eslint and obsidianmd plugins, Knip 6.43.0 dead-code scanner
- Plugin skeleton: `Plugin` base class with `onload()`/`onunload()`, command registration system, zod v4 settings validation, declarative settings via `getSettingDefinitions()` (Obsidian 1.13.0+)
- CI/CD: Quality workflow with node 24+26 matrix (tsc → eslint → knip → vitest → esbuild), release workflow on `release: published`, Dependabot for GitHub Actions and npm
- Test infrastructure: 61 tests covering build, types, lint, knip, CI workflows, settings, and plugin lifecycle — all passing
- Nyquist validation tests for interruption-atomicity guarantees
- Compliance gate script (`checks/phase2-checks.ps1`) enforcing all quality gates

### Changed

- **BREAKING**: Complete from-scratch rewrite. The old plugin codebase has been replaced entirely.

### Security

- No telemetry, self-update, or obfuscation strings in the bundle (Obsidian community policy compliance)
- ESLint Obsidian plugin enforces deprecated API usage detection
- Settings validation via zod v4 at trust boundaries
- GPL-3.0 license enforced (OSI-approved)
