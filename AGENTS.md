<!-- GSD:project-start source:PROJECT.md -->

## Project

**Semantic Graph Healer**

From-scratch rewrite of **Semantic Graph Healer**, an Obsidian plugin that diagnoses and repairs structural problems in large knowledge graphs (orphans, semantic conflicts, asymmetric links, missing chain links, hierarchy cycles, sink notes) and suggests — and applies — fixes. Desktop-first; source-available over GPL-3.0; published on GitHub and the Obsidian community directory. The author's own vault (`E:\Scuola 2`) is the primary test environment.

**Core Value:** Every run leaves the vault measurably better structured — trustworthy detection and safe repair of topology damage — without the user having to become a graph expert.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Obsidian app runtime | 1.14.5 desktop (public, 2026-10-22) | Host app | Latest public desktop; Electron 45 shell |
| `obsidian` (API types) | 1.14.4 (published 2026-10-08) | Plugin API typings | Only official API surface; compiled against, marked `external` at build |
| `obsidian-typings` | 6.50.0 (published 2026-10-19) | Enriched internal typings | Keeps working when a needed API isn't in the public d.ts; wraps `@obsidian-typings/obsidian-public-latest` |
| TypeScript | **5.9.3** | Language + `tsc --noEmit` type gate | Only version compatible with the whole quality toolchain in 2026 — see TS decision below |
| esbuild | 0.28.2 | Bundler (3 entry points) | Official Obsidian sample-plugin bundler; Go-native; no TS-API dependency; multi-entry CJS/IIFE proven |
| Svelte | 5.57.2 (runes) | Dashboard UI | Old plugin's choice; 16k-LOC single-component rendering problem; see "Svelte vs plain TS" below |
| vitest | 5.0.5 + vite 8.3.5 | Test runner | v5 major; peers vite ^6.4 ‖ ^7 ‖ ^8 — compatible with the vite we already need |
| zod | 4.6.7 | Settings/payload/schema validation | v4 stable; the rewrite imports it at trust boundaries (settings, imported data, repair plans) |
| Node.js | floor `>=24.15.0`, dev 24.22 → 26.x | Dev toolchain only (build/test/scripts) | jsdom engine floor is 24.15.0; Node 26 goes Active LTS 2026-10-28 |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@vitest/web-worker` | 5.0.5 | Worker tests in vitest | Testing the graph/analysis worker entry points |
| `@vitest/coverage-v8` | 5.0.5 | Coverage | CI gate; v8 provider, no extra binary |
| `jsdom` | 30.1.3 | DOM env for tests | Component/DOM tests; engine `^22.22.2 ‖ ^24.15.0 ‖ >=26.0.0` |
| `@sveltejs/vite-plugin-svelte` | 7.3.1 | Svelte in vite/vitest | Svelte compilation in tests; peers `vite ^8`, `svelte ^5.46.4` |
| `svelte-check` | 4.7.7 | Svelte typecheck (opt-in) | Only if we want `.svelte` type errors in CI; peers TS `^5 ‖ ^6` (also blocks TS 7) |
| `graphology` / `graphology-metrics` | 0.26.0 / 2.4.2 | In-process graph metrics | ARCHITECTURE decides engine; slow-moving but alive (~21 mo cadence) |
| `@ladybugdb/wasm-core` | 0.21.2 (published 2026-10-01) | WASM graph DB in worker | Alive, frequent releases (old plugin used 0.16.1 — a required bump) |
| `three` / `3d-force-graph` | 0.186.1 / 1.80.1 | 3D view | **Lazy-loaded separate bundle only** — see bundle shape |
| `pathe` / `p-queue` | 2.0.3 / 10.0.0 | Path utils / concurrency | Old plugin deps; p-queue 10 is a major bump from the old 9.1.2 |
| `typescript-eslint` | 8.72.0 | Type-aware lint | Peers TS `>=4.8.4 <6.1.0` |
| `eslint-plugin-obsidianmd` | 0.4.2 | Official Obsidian lint rules | Publishes deprecated-API style rules; repo `obsidianmd/eslint-plugin` |
| `knip` | 6.43.0 | Dead code / unused deps/exports | Enforces "no dead code" on a 25-phase-sized codebase |
| `prettier` | 3.9.10 | Format | |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| eslint 9.39.5 | Lint | **Pin 9.x, not 10** — see lint decision; flat config |
| lint-staged 17.6.0 | Pre-commit | Replaces husky + nano-staged (old combo); one maintained tool |
| stylelint 17.16.0 + `stylelint-config-standard` | CSS lint | Only if `styles.css` is non-trivial; drop if the dashboard ships one hand-written file |
| `@types/node` ^26.6.5 | Node types for scripts/tests | Matches dev Node 26 from 2026-10-28 |
| GitHub Actions | CI | ubuntu-latest, matrix node [24, 26] |

## The six open questions — answers with evidence

### Q1. TypeScript 5.9.3, not 7.0.2 — toolchain compatibility matrix

| Tool | TS 5.9.3 | TS 7.0.2 | Evidence |
|------|----------|----------|----------|
| esbuild 0.28.2 (bundle) | ✅ | ✅ | esbuild strips types itself; never imports the TS API |
| vitest 5.0.5 (via vite 8.3.5) | ✅ | ✅ | vite/esbuild transform; no TS-API import in the test path |
| zod 4.6.7 | ✅ | ✅ | runtime library, no compiler coupling |
| typescript-eslint 8.72.0 | ✅ | ❌ **hard fail** | peer range `typescript >=4.8.4 <6.1.0`; crashes with "typescript-eslint does not support TS 7.0"; maintainer: "There is nothing we can do about this until TS 7 provides an API" (issues #12518, #10940; WIP tracked against the 7.1 API, status update 2026-09-29) |
| svelte-check 4.7.7 | ✅ | ❌ peer `^5.0.0 ‖ ^6.0.0` rejects 7.0.2 | npm peer range |
| eslint-plugin-obsidianmd 0.4.2 | ✅ (via typescript-eslint ^8.35.1) | ❌ transitively | peer `typescript-eslint ^8.35.1` |
| `tsc --noEmit` gate | ✅ | ✅ (and 8–12× faster on big graphs) | MS devblog; but our codebase is ~16k LOC — seconds, not minutes |
| obsidianmd/obsidian-sample-plugin (official) | ✅ ships `typescript ^5.8.3` | — | sample package.json, branch `master` |
| tsconfig-shape risk | none | old tsconfig's `baseUrl`, implicit `types` (now `[]`), `strict` default changes | TS7 hard-errors every TS6 deprecation |

### Q2. Obsidian 1.14 API surface worth adopting in the rewrite

| API | Since | Verdict for the rewrite |
|-----|-------|--------------------------|
| `App.secretStorage` — `getSecret` / `setSecret` / `listSecrets` | 1.11.4 | **Adopt** — replaces the old AES-256-GCM fallback for AI keys on desktop; keep a capability-guarded fallback only if we ever ship mobile |
| **Declarative settings**: `PluginSettingTab.getSettingDefinitions(): SettingDefinitionItem[]` | **1.13.0** | **Adopt, Path A** (see below). `display()` is explicitly `@deprecated Since 1.13.0` in the d.ts; types: `toggle/text/textarea/number/slider/dropdown/file/folder/color`, `validate`, `visible`, `disabled`, `group`, `list`, `page` |
| `Plugin.settings?: unknown` | 1.13.0 | Adopt — the declarative controls read/write `this.plugin.settings[key]` and call `saveData()` for you |
| `SettingDefinitionItem#id` | 1.14.0 | Adopt when renaming a setting or two siblings share a name (the 20+ sections case) |
| Revamped searchable Settings panel | 1.13.0 | **Adoption driver**: community plugins appear in global settings search *only* if they use the new API; Obsidian also handles persistence + validation for free |
| `registerEvent` / `Component` lifecycle | 0.9.7 | Adopt (auto-detach on unload) |
| `debounce(cb, ms, reset?)` + `Debouncer.run()` | long-standing | **Use Obsidian's own** `debounce` for vault-event throttling instead of hand-rolling; tested via jsdom timers |
| Bases API (`BasesView`, `BaseViewHandlerFactory`, options) | 1.10.0 | **Defer** — nice-to-have "open in Bases" integration; not needed for v1 diagnosis/repair |
| Temml math rendering, `--font-preferred-size`, RTL workspace flip | 1.14.x | Awareness only; the dashboard should use `--font-preferred-size` if it renders user content |

### Q3. Bundling — final shape

- **`splitting: true` is unavailable for main.js**: "Code splitting is still a work in progress. It currently only works with the `esm` output format." So do **not** set `splitting`. Without it, `import()` compiles to `Promise.resolve().then(() => require())` and stays inside the same bundle.
- Therefore the lazy 3D view = **its own entry point** + mark `'./3d-view.js'` external in the main build + `await import('./3d-view.js')` on first open of the 3D view. (Obsidian loads plugins from disk as CJS, so a relative `require`/dynamic import of a sibling file resolves.)
- WASM: esbuild has **no built-in `.wasm` loader**; emit with the `file` loader and instantiate at runtime inside the worker (do not inline a multi-MB binary as base64 into main.js).
- Keep the old rename-styles plugin (`main.css` → `styles.css`) — Obsidian looks for `styles.css`.

| Artifact | Budget | Rationale |
|----------|--------|-----------|
| `main.js` (minified) | ≤ 250 KB (gzip ≤ 90 KB) | Startup time on 100k-note vaults; old target was < 200 KB |
| `3d-view.js` (lazy) | ≤ 900 KB | three + 3d-force-graph ≈ 600–900 kB minified; only paid when opened |
| worker bundles | ≤ 300 KB each | Off-main-thread |
| whole plugin dir (incl. wasm) | ≤ 5 MB | Ladybug wasm is multi-MB; BRAT/download sanity |

### Q4. Test setup on vitest 5

| Pattern | Where seen | Assessment |
|---------|-----------|------------|
| `resolve.alias { obsidian → mock module }` (`tests/obsidian.ts` re-export) | old plugin's own config; zotlit (`__mocks__/obsidian.ts` + alias; "the real `obsidian` package is types-only… without this alias any test that imports values from `obsidian` fails to resolve") | **The base mechanism — keep it.** Vitest-native, no runtime interposition cost |
| `mnaoumov/obsidian-test-mocks` 7.3.0 (vitest-setup entry auto-patches globals + `vi.mock('obsidian')`) | mnaoumov/obsidian-test-mocks README (updated 2026-10); "Reading a property nobody mocked throws a descriptive error instead of returning `undefined`, so a test cannot pass for the wrong reason" | **Adopt as the mock's engine** — that failure mode is exactly the class PITFALLS catalogs. Note it depends on `turndown` (markdown rendering mocks) |
| `chhoumann/obsidian-test-kit` 0.1.0 (`obsidian-test-kit/stub` alias + setup) | its README | Rejected for v1: version 0.1.0, peer vitest >=1.0.0 — too young to standardise on |
| hand-written `vi.mock('obsidian', ...)` in a global setup | green-dalii/obsidian-llm-wiki `src/__tests__/setup.ts` | Works but reinvents the above |

### Q5. Lint / format / CI

| Concern | Decision | Why (live evidence) |
|---------|----------|---------------------|
| eslint version | **9.39.5** (the current `maintenance` line; latest is 10.13.0) | eslint 10 ships `@eslint/js@10` and `@eslint/json@2.1.1`, but `eslint-plugin-obsidianmd@0.4.2` pins peers `@eslint/js ^9.30.1` and `@eslint/json 0.14.0` (exact) → an unsatisfiable peer pair on strict installs. Publish date of the official plugin: 2026-08-24 (alive, ~2 months cadence) |
| typed lint | `typescript-eslint 8.72.0` flat config (`tseslint.configs.recommendedTypeChecked`-tier, tuned) | Peers eslint `^8.57 ‖ ^9 ‖ ^10` and TS `<6.1.0` |
| Obsidian rules | `eslint-plugin-obsidianmd 0.4.2` | Only official rule set (repo `obsidianmd/eslint-plugin`); catches deprecated-API misuse — pairs with `minAppVersion 1.13.0` decision |
| formatter | prettier 3.9.10 + `eslint-config-prettier` | |
| dead code | knip 6.43.0 (`--production` in CI) | 25 phases of history ⇒ keep this gate or the rewrite rots |
| pre-commit | **lint-staged 17.6.0** (drop husky 9.1.7 + nano-staged 0.8.0) | one maintained tool; `nano-staged` is effectively dormant next to lint-staged |
| CI | GitHub Actions, `ubuntu-latest`, matrix node **[24, 26]** | Steps: `npm ci` → `tsc --noEmit` → `eslint .` → `knip --production` → `vitest run --coverage` → `node .config/esbuild.config.mjs production` → **bundle-size gate** (fail if main.js > 250 KB). Windows runners are unnecessary; the release job can run on windows-latest if a `.exe`/installer is ever needed (it isn't) |

### Q6. Node version baseline

| Line | Status on 2026-10-23 | Detail |
|------|---------------------|--------|
| 24 (Krypton) | **Maintenance LTS** since 2026-10-20 | security/critical only until EOL 2028-04-30; latest 24.22.1 (2026-10-21) |
| 26 | **Current** → Active LTS **2026-10-28** | 26.12.1 (2026-10-21); full support until 2027-10-27, EOL 2029-04-30 |
| 22 (Jod) | Maintenance LTS | EOL 2027-04-30 — retiring |

## Installation

# Runtime deps (bundled into the plugin)

# Obsidian API (types only, external at build)

# Dev toolchain

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| TypeScript 5.9.3 | TypeScript 7.0.2 (`@typescript/native` alias + `typescript@npm:@typescript/typescript6`) | Only after typescript-eslint ships TS-7.1 support (issue #10940) and svelte-check widens peers; until then TS7 buys milliseconds and costs the linter |
| esbuild 0.28.2 | Vite 8 + Rolldown/Oxc (or `tsdown`) for the plugin build | Wrong shape: Obsidian wants 2–3 hand-placed CJS/IIFE files, not an app build; Rolldown is the Vite-8-era answer for apps/libraries and is still maturing. Keep esbuild for the *bundle*; vite stays only as vitest's engine |
| Svelte 5.57.2 (runes) | Plain TS + DOM helpers for the dashboard | If the rewrite's dashboard stays < ~5 components or the author prefers zero framework: plain TS + Obsidian's `Setting`/`createEl` is faster to boot and has no build plugin. Our dashboard is 20+ setting sections + suggestion lists + 3D — Svelte's runes reactivity is the right tool. **Keep Svelte** |
| vitest 5 | jest (the Obsidian Hub's historic guide) | Only for consistency with old docs; vitest 5 is faster, shares vite's config, and the 2026 mocking ecosystem (`obsidian-test-mocks`) targets it |
| eslint 9.39.5 | eslint 10.13.0 | When `eslint-plugin-obsidianmd` ≥ 0.5 updates its `@eslint/js`/`@eslint/json` peers; re-check at each dependency bump |
| npm | pnpm | pnpm is fine for a single-package repo but adds no value here and the official sample + Obsidian community tooling assume npm; avoids a class of strict-node_modules resolution surprises with build plugins |
| Follow-the-official `external:` list | Bundling deps (e.g. `@codemirror/*`) in | Never — Obsidian already provides them; bundling duplicates megabytes into the plugin |
| Local mock module + `obsidian-test-mocks` | `obsidian-test-kit` | When it hits 1.x and covers our API surface; at 0.1.0 it is a risk |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `typescript@7.0.2` | No compiler API ⇒ typescript-eslint crashes ("does not support TS 7.0"), svelte-check peer range rejects it | `typescript@5.9.3`; revisit on the objective trigger |
| `eslint@10` today | eslint-plugin-obsidianmd 0.4.2 peers `@eslint/js ^9.30.1` / `@eslint/json 0.14.0` exact ⇒ peer conflict | `eslint@9.39.5` |
| `splitting: true` in esbuild | ESM-only; main.js must be CJS → either ignored or a broken build | Separate entry points + `external` sibling + runtime `import()` |
| Inlining the Ladybug WASM (base64 / `text` loader) | Multi-MB inside main.js kills startup | `.wasm` → `file` loader, instantiate at runtime in the worker |
| husky + nano-staged | dormant combination | lint-staged 17.6.0 |
| `cross-env NODE_OPTIONS='--no-warnings'` on vitest | vestigial from old Node lines | plain `vitest run` |
| `@vitest/web-worker@4`, `@testing-library/jest-dom@<7` | v4 leftovers in the old lockfile | 5.0.5 / 7.0.1 |
| Pre-1.13 imperative `display()` | Explicitly `@deprecated Since 1.13.0`; loses settings search indexing | `getSettingDefinitions()` (Path A) |
| Node `engines: ">=24.0.0"` | jsdom 30 needs ≥24.15.0 | `>=24.15.0` |

## Stack Patterns by Variant

## Version Compatibility (verified lattice)

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| typescript 5.9.3 | typescript-eslint 8.72.0 (`>=4.8.4 <6.1.0`), svelte-check 4.7.7 (`^5 ‖ ^6`), obsidian 1.14.4, esbuild 0.28.2 | The lattice that works today |
| vitest 5.0.5 | vite 8.3.5 (`^6.4 ‖ ^7 ‖ ^8`), jsdom 30.1.3, @vitest/* 5.0.5 exact, @types/node `^22 ‖ >=24`, node `^22.12 ‖ ^24 ‖ >=26` | |
| @sveltejs/vite-plugin-svelte 7.3.1 | vite `^8.0.0-beta.7 ‖ ^8.0.0`, svelte `^5.46.4` | Must match the vite major |
| eslint-plugin-obsidianmd 0.4.2 | eslint `>=9.19.0` (pin 9.39.5), @eslint/js `^9.30.1`, @eslint/json `0.14.0`, typescript-eslint `^8.35.1`, obsidian `1.8.7` (types only) | The single constraint that pins eslint to 9.x |
| obsidian 1.14.4 | minAppVersion ≤ 1.14.4; deps moment 2.31.0 + @types/codemirror (types only) | Types-only package, `main: ""` |
| jsdom 30.1.3 | node `^22.22.2 ‖ ^24.15.0 ‖ >=26.0.0` | Source of the 24.15.0 engines floor |
| @ladybugdb/wasm-core 0.21.2 | worker bundle (IIFE) | Old plugin pinned 0.16.1 — must move; verify loader API in ARCHITECTURE |
| Electron 45.0.0 (Obsidian 1.14's shell) | `target: 'es2022'`, Node-22-class runtime for workers | Do not target higher than Electron 45's Chromium |

## Sources

- npm registry, live metadata for ~30 packages (versions, dist-tags, peerDependencies, engines) — accessed 2026-10-23. Underpins every version row and the peer-range constraints.
- https://github.com/obsidianmd/obsidian-sample-plugin (branch `master`) — `package.json` (esbuild 0.25.5, typescript ^5.8.3, typescript-eslint ^8.59.1, obsidian `latest`, script `tsc -noEmit -skipLibCheck`) and `esbuild.config.mjs` (external list, format cjs, target es2021, banner) — accessed 2026-10-23.
- https://unpkg.com/obsidian@1.14.4/obsidian.d.ts — the full API surface; confirmed `secretStorage` @since 1.11.4, `getSettingDefinitions()`/`SettingDefinitionItem`/`SettingDefinitionPage`/`Plugin.settings` @since 1.13.0, `display()` `@deprecated Since 1.13.0`, `manifest.dir`, Bases @since 1.10.0 — accessed 2026-10-23.
- https://obsidian.md/changelog/2026-09-02-desktop-v1.14.0/ — Developers section: Temml replaces MathJax, `SettingDefinitionItem#id` added — accessed 2026-10-23.
- https://obsidian.md/changelog/2026-10-22-desktop-v1.14.5/ — latest public desktop — accessed 2026-10-23.
- https://github.com/obsidianmd/obsidian-releases (releases list) — v1.14.5 published 2026-10-22; v1.13.8 2026-08-20 (end of 1.13 line) — accessed 2026-10-23.
- https://docs.obsidian.md/Plugins/User+interface/Settings (via exa highlight + index) — declarative settings requires 1.13.0+; control types; `getSettingDefinitions()` called on every tab update and once at registration for search indexing; `validate` is a UI gate not an invariant — accessed 2026-10-23.
- https://github.com/obsidianmd/obsidian-developer-docs `en/Plugins/Guides/Migrate to declarative settings.md` — Path A vs Path B guidance ("Prefer Path A whenever you can") — accessed 2026-10-23.
- https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/ — no programmatic API in 7.0; side-by-side with `@typescript/typescript6`; API expected in 7.1 — accessed 2026-10-23.
- https://github.com/typescript-eslint/typescript-eslint/issues/12518 and #10940 — maintainer statements that TS 7 is unsupported pending the 7.1 API (2026-07-08, 2026-09-29) — accessed 2026-10-23.
- https://github.com/yeojz/otplib/pull/879 — third-party confirmation table: TS 7.0.2 breaks typescript-eslint, typedoc, tsup/dts — accessed 2026-10-23.
- https://esbuild.github.io/api/ (`#splitting`) — "Code splitting… currently only works with the `esm` output format"; without splitting an `import()` becomes `Promise.resolve().then(() => require())` — accessed 2026-10-23.
- https://github.com/nodejs/Release — 24 Maintenance 2026-10-20 / EOL 2028-04-30; 26 Current, Active LTS 2026-10-28, EOL 2029-04-30 — accessed 2026-10-23.
- https://nodejs.org/en/blog/announcements/evolving-the-nodejs-release-schedule — new annual cadence from 27.x (2027) — accessed 2026-10-23.
- https://github.com/mnaoumov/obsidian-test-mocks (README, updated 2026-10) — vitest setup entry auto-mocks `obsidian`; unmocked property access throws; npm version 7.3.0 — accessed 2026-10-23.
- https://github.com/chhoumann/obsidian-test-kit — stub-alias pattern, peer vitest >=1.0.0, v0.1.0 — accessed 2026-10-23.
- https://github.com/aidenlx/zotlit `apps/obsidian/__mocks__/obsidian.ts` — resolve.alias mock for a types-only obsidian package — accessed 2026-10-23.
- https://vite.dev/guide/rolldown.html + rolldown.rs — Vite 8 (2026-03-12) moved to Rolldown+Oxc; tsdown is the Rolldown library bundler (context for "why not switch the plugin bundler") — accessed 2026-10-23.
- No official Obsidian cap on plugin bundle size exists — the 250 KB main.js budget is the *project's* carried-over target, not a platform limit (fallback: measure startup delta on `E:\Scuola 2`, keep the CI gate as the enforcement).
- The community "obsidian-release" GitHub Action was not verified today (fallback: hand-rolled version-bump + `gh release create` with three assets).
- `docs.obsidian.md` pages are JS-rendered and could not be fetched directly with three different fetch paths (ctx fetch, crawlberg browser, webfetch); the settings content above was recovered through search-highlight extraction of the same official URLs — treat wording as verified, but the in-page navigation/anchors as LOW confidence.
- `@ladybugdb/wasm-core`'s exact WASM loading API for esbuild `file`-loader output is ARCHITECTURE's question — the STACK-level constraint (no built-in wasm loader, emit + instantiate) is verified.

## Recommendations for the rewrite

- esbuild bundling (0.28.2) with the exact `external:` list (obsidian, electron, `@codemirror/*`, `@lezer/*`, node builtins) and the `main.css → styles.css` rename plugin.
- vitest + jsdom + obsidian-vitest-alias testing approach (upgrade vitest 4 → 5.0.5).
- Svelte 5 runes for the dashboard (^5.46.4; 5.57.2 today) with `compilerOptions: { runes: true }`.
- zod for validation (old project deferred v4; 4.6.7 is stable — import it at trust boundaries).
- SecretStorage keychain on desktop (1.11.4+) — the new declarative-settings floor makes 1.11.4 moot, keep the capability guard for the deferred mobile path.
- `pathe`, `p-queue` (bump 9.1.2 → 10.0.0 — re-check the v10 API surface before porting).
- husky + nano-staged → lint-staged 17.6.0 only.
- `cross-env` (the NODE_OPTIONS wrapper is vestigial on Node 24+).
- `cypress` (15.17 in the old devDeps — an unused multi-hundred-MB dep for a plugin with no E2E harness).
- esbuild-svelte + svelte-preprocess indirection if svelte-check/`vite-plugin-svelte` covers the same job in tests — verify before adding both.
- Any `baseUrl`-style tsconfig leftovers when writing the new tsconfig (they are TS7 errors and TS6 deprecations).
- `stylelint` unless `styles.css` grows beyond a single hand-written file.
- TypeScript `^5.0.0` (which resolved to 5.9.3 by drift) → **pin `5.9.3` explicitly**, with the TS-7.1/typescript-eslint-#10940 trigger written in the README.
- Imperative `display()` settings (20+ sections) → **declarative `getSettingDefinitions()` with `SettingDefinitionPage` sub-pages**; bump `minAppVersion` 1.11.4 → **1.13.0**; delete `display()`.
- eslint `^10.1.0` → **9.39.5** (peer-compatible with `eslint-plugin-obsidianmd@0.4.2`), typescript-eslint → 8.72.0, eslint-plugin-obsidianmd → 0.4.2 (was 0.1.9).
- `obsidian-typings` ^5.18.0 → 6.50.0.
- `@types/node` ^24.12.4 → ^26.6.5 (dev Node 26 after 2026-10-28), `engines.node` `>=24.0.0` → **`>=24.15.0`**.
- The hand-rolled `tests/obsidian.ts` mock → keep the alias mechanism but back it with **`obsidian-test-mocks` 7.3.0** (unmocked-property throws = no false-green tests).
- Single-bundle 3D view (three.js in main.js) → **lazy `3d-view.js` entry point** loaded via external `./3d-view.js` + runtime `import()`, with a CI size gate.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-fast` for a trivial task inline, with no subagents and no PLAN.md
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
