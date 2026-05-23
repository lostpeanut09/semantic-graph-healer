---
created: 2025-05-20
status: complete
completed: 2025-05-20
description: Check WSL dependencies (nodejs, npm, eslint, etc.)
---

# Quick Task Summary: Check WSL Dependencies

**Status**: Complete ✓

## Findings

### ✅ Installed and Working

- **Node.js**: v24.15.0
- **npm**: v11.12.1
- **ESLint**: v10.4.0 (via npx)
- **Vitest**: v4.1.6 (via npx)
- **Knip**: 6.14.1
- **Husky**: available
- **node_modules**: 47MB installed
- **Alternative package managers**: yarn, pnpm, bun available

### ⚠️ Issues Detected

1. **TypeScript compiler missing** (tsc)
    - `typescript` listed in devDependencies (^5.0.0)
    - No `.bin/tsc` symlink in node_modules
    - Running `npx tsc` fails with: "This is not the tsc command you are looking for"
    - **Impact**: Build process (`npm run build`) will fail at TypeScript compile step

2. **npm audit: moderate vulnerability**
    - `esbuild` <=0.24.2 has a moderate severity issue
    - Fix available via `npm audit fix --force` but introduces breaking change (esbuild@0.28.0)

### 🔍 Other Observations

- `prettier` and `stylelint` not locally installed (npx will auto-fetch)
- Multiple UNMET DEPENDENCY warnings in npm ls output:
    - `@eslint/js@^9.10.0`
    - `@eslint/json@^0.14.0`
    - `@faker-js/faker@^10.4.0`
    - `@sveltejs/vite-plugin-svelte@^7.1.2`
    - `@types/node@^24.12.4`
- Extraneous packages present (not necessarily harmful)

## Recommendations

1. **Fix TypeScript installation**:
    - Run `npm install` (may not have fully installed devDeps)
    - Or reinstall specifically: `npm install typescript --save-dev`
    - If issue persists, check npm permissions/symlinks

2. **Address audit vulnerability**:
    - Evaluate impact of esbuild breaking change
    - Consider `npm audit fix --force` with testing
    - Or pin esbuild to a patched version if available

3. **Clean up unmet dependencies**:
    - Review devDependencies vs peer dependencies
    - Run `npm install` to fully resolve tree
