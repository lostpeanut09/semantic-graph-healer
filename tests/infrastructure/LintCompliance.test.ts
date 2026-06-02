import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

const ESLINT_CMD = 'npx eslint -c .config/eslint.config.js';

/** Result from running a command. */
interface CmdResult {
    stdout: string;
    exitCode: number;
}

/**
 * Runs ESLint on the specified file(s) and returns { stdout, exitCode }.
 * Never throws — captures output even on non-zero exit.
 */
function lintFileSafe(filePath: string): CmdResult {
    try {
        const stdout = execSync(`${ESLINT_CMD} ${filePath}`, {
            cwd: process.cwd(),
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 60_000,
        });
        return { stdout, exitCode: 0 };
    } catch (e: unknown) {
        const err = e as NodeJS.ErrnoException & {
            stdout?: string;
            stderr?: string;
            status?: number;
        };
        const msg = (err.stdout ?? err.stderr ?? '').toString();
        return { stdout: msg, exitCode: err.status ?? 1 };
    }
}

function countMatches(output: string, pattern: string): number {
    const regex = new RegExp(pattern, 'gi');
    const matches = output.match(regex);
    return matches ? matches.length : 0;
}

// Cache the full-project lint scan — run once in beforeAll
let fullLintResult: CmdResult | null = null;

// ============================================================
// Phase 13 — Linting & Repository Hardening Compliance Suite
// ============================================================

describe('Phase 13 — Linting & Repository Hardening', () => {
    beforeAll(() => {
        // Run full project lint once and cache for all full-project checks
        if (fullLintResult === null) {
            fullLintResult = lintFileSafe('.');
        }
    }, 120_000);

    // -------------------------------------------------------
    // 13-01: ESLint Config & Husky Hooks
    // -------------------------------------------------------
    describe('13-01-01: ESLint Config for Svelte 5 Runes and Scoped Scripts', () => {
        it('should recognize Svelte 5 runes in .svelte.ts store files without errors', () => {
            const result = lintFileSafe('src/views/dashboard/DashboardStore.svelte.ts');
            expect(result.exitCode, `ESLint failed on DashboardStore.svelte.ts:\n${result.stdout}`).toBe(0);
        }, 120_000);

        it('should allow Node.js globals in scripts/**/*.ts and disable browser globals', () => {
            const result = lintFileSafe('scripts/generate-mock-vault.ts');
            expect(result.exitCode, `ESLint failed on generate-mock-vault.ts:\n${result.stdout}`).toBe(0);
        }, 120_000);

        it('should NOT report no-console or import/no-nodejs-modules in scripts/', () => {
            const result = lintFileSafe('scripts/generate-mock-vault.ts');
            expect(result.exitCode, `ESLint should allow console and Node built-ins in scripts`).toBe(0);
        }, 120_000);
    });

    describe('13-01-02: Husky Hooks for CI/CD Alignment', () => {
        it('should have a pre-commit hook file', () => {
            const hookPath = path.resolve(process.cwd(), '.husky/pre-commit');
            expect(existsSync(hookPath)).toBe(true);
        });

        it('should have a pre-push hook file', () => {
            const hookPath = path.resolve(process.cwd(), '.husky/pre-push');
            expect(existsSync(hookPath)).toBe(true);
        });

        it('pre-push hook should contain build, lint, test, and knip steps', () => {
            const hookPath = path.resolve(process.cwd(), '.husky/pre-push');
            const content = readFileSync(hookPath, 'utf8');
            expect(content).toMatch(/npm run build/);
            expect(content).toMatch(/npm run lint/);
            expect(content).toMatch(/npm (run )?test/);
            expect(content).toMatch(/npm run knip/);
        });

        it('pre-commit hook should contain lint:fix and format steps', () => {
            const hookPath = path.resolve(process.cwd(), '.husky/pre-commit');
            const content = readFileSync(hookPath, 'utf8');
            expect(content).toMatch(/npm run lint:fix/);
            expect(content).toMatch(/npm run format/);
        });
    });

    // -------------------------------------------------------
    // 13-02: Sentence Case & Common Lint Warnings
    // -------------------------------------------------------
    describe('13-02-03: Zero obsidianmd/ui/sentence-case Warnings', () => {
        it('should have zero sentence-case warnings across the entire project', () => {
            const result = lintFileSafe('.');
            const count = countMatches(result.stdout, 'sentence-case');
            expect(count, `Found ${count} sentence-case warning(s) in the project:\n${result.stdout}`).toBe(0);
        }, 120_000);
    });

    describe('13-02-04: Zero Common Lint Warnings', () => {
        it('should have zero no-unused-vars warnings', () => {
            const result = lintFileSafe('.');
            const count = countMatches(result.stdout, 'no-unused-vars');
            expect(count, `Found ${count} no-unused-vars warning(s)`).toBe(0);
        }, 120_000);

        it('should have zero require-await warnings', () => {
            const result = lintFileSafe('.');
            const count = countMatches(result.stdout, 'require-await');
            expect(count, `Found ${count} require-await warning(s)`).toBe(0);
        }, 120_000);

        it('should have zero no-floating-promises warnings', () => {
            const result = lintFileSafe('.');
            const count = countMatches(result.stdout, 'no-floating-promises');
            expect(count, `Found ${count} no-floating-promises warning(s)`).toBe(0);
        }, 120_000);

        it('should have zero no-console warnings', () => {
            const result = lintFileSafe('.');
            const count = countMatches(result.stdout, 'no-console');
            expect(count, `Found ${count} no-console warning(s)`).toBe(0);
        }, 120_000);
    });

    // -------------------------------------------------------
    // 13-03: Eliminate `any` in Core Workers & Communication
    // -------------------------------------------------------
    describe('13-03-05: Zero no-explicit-any in graph-analysis-core.ts', () => {
        it('should have zero @typescript-eslint/no-explicit-any warnings in graph-analysis-core.ts', () => {
            const result = lintFileSafe('src/core/workers/graph-analysis-core.ts');
            const count = countMatches(result.stdout, 'no-explicit-any');
            expect(
                count,
                `Found ${count} no-explicit-any warning(s) in graph-analysis-core.ts:\n${result.stdout}`,
            ).toBe(0);
        }, 120_000);
    });

    describe('13-03-06: Zero no-explicit-any in DashboardStore and GraphVisualizerView', () => {
        it('should have zero @typescript-eslint/no-explicit-any warnings in DashboardStore.svelte.ts', () => {
            const result = lintFileSafe('src/views/dashboard/DashboardStore.svelte.ts');
            const count = countMatches(result.stdout, 'no-explicit-any');
            expect(
                count,
                `Found ${count} no-explicit-any warning(s) in DashboardStore.svelte.ts:\n${result.stdout}`,
            ).toBe(0);
        }, 120_000);

        it('should have zero @typescript-eslint/no-explicit-any warnings in GraphVisualizerView.ts', () => {
            const result = lintFileSafe('src/views/GraphVisualizerView.ts');
            const count = countMatches(result.stdout, 'no-explicit-any');
            expect(
                count,
                `Found ${count} no-explicit-any warning(s) in GraphVisualizerView.ts:\n${result.stdout}`,
            ).toBe(0);
        }, 120_000);
    });

    // -------------------------------------------------------
    // 13-04: TypeScript Build & MultiGraph Type
    // -------------------------------------------------------
    describe('13-04-07: TypeScript Compilation (tsc --noEmit)', () => {
        it('should exit with code 0 with no errors', () => {
            let exitCode = 0;
            let output = '';
            try {
                execSync('npx tsc --noEmit --skipLibCheck', {
                    cwd: process.cwd(),
                    encoding: 'utf8',
                    stdio: 'pipe',
                    timeout: 120_000,
                });
            } catch (e: unknown) {
                const err = e as NodeJS.ErrnoException & {
                    stdout?: string;
                    stderr?: string;
                    status?: number;
                };
                exitCode = err.status ?? 1;
                output = ((err.stdout ?? '') + (err.stderr ?? '')).trim();
            }
            expect(exitCode, `tsc --noEmit failed with exit code ${exitCode}:\n${output}`).toBe(0);
        }, 180_000);
    });

    describe('13-04-08: npm run build', () => {
        it('should exit with code 0 (includes tsc --noEmit and esbuild)', () => {
            let exitCode = 0;
            let output = '';
            try {
                execSync('npm run build', {
                    cwd: process.cwd(),
                    encoding: 'utf8',
                    stdio: 'pipe',
                    timeout: 180_000,
                });
            } catch (e: unknown) {
                const err = e as NodeJS.ErrnoException & {
                    stdout?: string;
                    stderr?: string;
                    status?: number;
                };
                exitCode = err.status ?? 1;
                output = ((err.stdout ?? '') + (err.stderr ?? '')).trim();
            }
            expect(exitCode, `npm run build failed with exit code ${exitCode}:\n${output}`).toBe(0);
        }, 300_000);
    });

    // -------------------------------------------------------
    // 13-05: Residual sentence-case and unused-vars
    // -------------------------------------------------------
    describe('13-05-09: Zero sentence-case warnings in settings section files', () => {
        const settingsFiles = [
            'src/views/sections/DeepAnalyticsSettings.ts',
            'src/views/sections/ExperimentalSettings.ts',
            'src/views/sections/IntegrationsSettings.ts',
            'src/views/sections/ResilienceSettings.ts',
        ];

        it('should have zero sentence-case warnings across all 4 settings files', () => {
            const fileList = settingsFiles.join(' ');
            const result = lintFileSafe(fileList);
            const count = countMatches(result.stdout, 'sentence-case');
            expect(count, `Found ${count} sentence-case warning(s) in settings files:\n${result.stdout}`).toBe(0);
        }, 120_000);

        for (const file of settingsFiles) {
            it(`should have zero sentence-case warnings in ${path.basename(file)}`, () => {
                const result = lintFileSafe(file);
                const count = countMatches(result.stdout, 'sentence-case');
                expect(count, `Found ${count} sentence-case warning(s) in ${file}:\n${result.stdout}`).toBe(0);
            }, 120_000);
        }
    });

    describe('13-05-10: Zero no-unused-vars warnings in GraphEngine, StructuralCache, BaseAdapter', () => {
        const coreFiles = [
            'src/core/GraphEngine.ts',
            'src/core/StructuralCache.ts',
            'src/core/adapters/BaseAdapter.ts',
        ];

        it('should have zero no-unused-vars warnings across all 3 core files', () => {
            const fileList = coreFiles.join(' ');
            const result = lintFileSafe(fileList);
            const count = countMatches(result.stdout, 'no-unused-vars');
            expect(count, `Found ${count} no-unused-vars warning(s) in core files:\n${result.stdout}`).toBe(0);
        }, 120_000);

        for (const file of coreFiles) {
            it(`should have zero no-unused-vars warnings in ${path.basename(file)}`, () => {
                const result = lintFileSafe(file);
                const count = countMatches(result.stdout, 'no-unused-vars');
                expect(count, `Found ${count} no-unused-vars warning(s) in ${file}:\n${result.stdout}`).toBe(0);
            }, 120_000);
        }
    });
});
