# Plan: Rerun Quality Tools

Execute a final sweep of the project's quality and hardening tools to ensure v1.0 readiness.

## Tasks

1. **Rerun ESLint**: Ensure zero warnings remain across the codebase.
2. **Rerun Prettier**: Verify all files follow the established formatting rules.
3. **Run Knip**: Identify and report any unused dependencies or exports.
4. **Verify Husky Hooks**: Ensure the pre-commit and pre-push hooks are correctly installed.
5. **Check Zod Status**: Verify Zod version and run related tests if applicable.

## Success Criteria

- `npm run lint` returns 0 warnings.
- `npm run format` completes without changes (idempotency).
- `npm run knip` report is reviewed.
- `.husky/pre-commit` and `.husky/pre-push` exist.
- Zod tests pass.
