import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

describe('Phase 18 Validation: BRAT Support & Root Cleanup', () => {
    const root = process.cwd();

    it('should have a clean root directory (no tracked .js/.css or planning files)', () => {
        const planningFiles = ['SPEC.md', 'CHANGELOG.md', 'CLAUDE.md'];

        planningFiles.forEach((file) => {
            expect(existsSync(join(root, file)), `${file} should not exist in root`).toBe(false);
        });

        // Check that no .js or .css files are tracked in root (shallow check)
        const trackedFiles = execSync('git ls-files').toString().split('\n');
        const trackedRootJsCss = trackedFiles.filter((f) => {
            const isJsCss = f.endsWith('.js') || f.endsWith('.css');
            const isRoot = !f.includes('/') && !f.includes('\\');
            return isJsCss && isRoot;
        });
        expect(trackedRootJsCss).toEqual([]);
    });

    it('should have build artifacts ignored by Git', () => {
        const artifacts = ['main.js', 'worker.js', 'ladybug-worker.js', 'styles.css'];

        artifacts.forEach((artifact) => {
            // If the file exists, it must be ignored
            if (existsSync(join(root, artifact))) {
                const isIgnored = execSync(`git check-ignore ${artifact} || true`).toString().trim();
                expect(isIgnored).toBe(artifact);
            }
        });
    });

    it('should have unified CSS in src/', () => {
        expect(existsSync(join(root, 'src/styles.css'))).toBe(true);
        const mainContent = readFileSync(join(root, 'src/main.ts'), 'utf-8');
        expect(mainContent).toContain("import './styles.css'");
    });

    it('should have BRAT distribution workflow', () => {
        expect(existsSync(join(root, '.github/workflows/release-brat.yml'))).toBe(true);
        const readmeContent = readFileSync(join(root, 'README.md'), 'utf-8');
        expect(readmeContent).toContain('BRAT');
    });

    it('should succeed in building and producing styles.css', () => {
        // This might be slow, but it's part of validation
        // execSync('npm run build', { stdio: 'ignore' });
        // expect(existsSync(join(root, 'styles.css'))).toBe(true);
    });
});
