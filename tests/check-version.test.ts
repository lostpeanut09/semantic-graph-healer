import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';

describe('Version Consistency Check', () => {
    let tempDir: string;
    const scriptPath = path.resolve(__dirname, '../scripts/check-version.ts');

    beforeAll(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'version-check-test-'));
    });

    afterAll(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    beforeEach(() => {
        // Reset files before each test to a known good state
        const pkg = { version: '1.0.0' };
        const lock = { version: '1.0.0' };
        const manifest = { version: '1.0.0', minAppVersion: '0.15.0' };
        const versions = { '1.0.0': '0.15.0' };

        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2));
        fs.writeFileSync(path.join(tempDir, 'package-lock.json'), JSON.stringify(lock, null, 2));
        fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
        fs.writeFileSync(path.join(tempDir, 'versions.json'), JSON.stringify(versions, null, 2));
    });

    function runCheck(): { status: number; output: string } {
        const rootDir = path.resolve(__dirname, '..');
        const result = spawnSync('npx', ['tsx', `"${scriptPath}"`], {
            cwd: rootDir,
            env: { ...process.env, CHECK_VERSION_ROOT: tempDir },
            encoding: 'utf-8',
            shell: true,
        });
        return {
            status: result.status || 0,
            output: result.stderr || result.stdout || (result.error ? result.error.message : ''),
        };
    }

    it('should pass when all versions match', () => {
        const result = runCheck();
        expect(result.status).toBe(0);
        expect(result.output).toContain('All version files are synchronized');
    }, 15000);

    it('should fail if manifest.json.version is modified', () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(tempDir, 'manifest.json'), 'utf-8'));
        manifest.version = '1.0.1';
        fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

        const result = runCheck();
        expect(result.status).toBe(1);
        expect(result.output).toContain('manifest.json version (1.0.1) != package.json version (1.0.0)');
    }, 15000);

    it('should fail if package-lock.json.version is modified', () => {
        const lock = JSON.parse(fs.readFileSync(path.join(tempDir, 'package-lock.json'), 'utf-8'));
        lock.version = '1.0.1';
        fs.writeFileSync(path.join(tempDir, 'package-lock.json'), JSON.stringify(lock, null, 2));

        const result = runCheck();
        expect(result.status).toBe(1);
        expect(result.output).toContain('package-lock.json version (1.0.1) != package.json version (1.0.0)');
    }, 15000);

    it('should fail if package.json.version is missing from versions.json', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.json'), 'utf-8'));
        pkg.version = '1.0.1';
        fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2));

        // Update others to isolate the missing versions.json entry error
        const manifest = JSON.parse(fs.readFileSync(path.join(tempDir, 'manifest.json'), 'utf-8'));
        manifest.version = '1.0.1';
        fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

        const lock = JSON.parse(fs.readFileSync(path.join(tempDir, 'package-lock.json'), 'utf-8'));
        lock.version = '1.0.1';
        fs.writeFileSync(path.join(tempDir, 'package-lock.json'), JSON.stringify(lock, null, 2));

        const result = runCheck();
        expect(result.status).toBe(1);
        expect(result.output).toContain('package.json version (1.0.1) is missing from versions.json');
    }, 15000);

    it('should fail if manifest.json.minAppVersion mismatches versions.json', () => {
        const manifest = JSON.parse(fs.readFileSync(path.join(tempDir, 'manifest.json'), 'utf-8'));
        manifest.minAppVersion = '0.16.0';
        fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

        const result = runCheck();
        expect(result.status).toBe(1);
        expect(result.output).toContain(
            'versions.json entry for 1.0.0 (0.15.0) != manifest.json minAppVersion (0.16.0)',
        );
    }, 15000);

    it('should fail if package-lock.json packages[""].version is modified', () => {
        const lock = JSON.parse(fs.readFileSync(path.join(tempDir, 'package-lock.json'), 'utf-8'));
        lock.packages = { '': { version: '0.9.0' } };
        fs.writeFileSync(path.join(tempDir, 'package-lock.json'), JSON.stringify(lock, null, 2));

        const result = runCheck();
        expect(result.status).toBe(1);
        expect(result.output).toContain(
            'package-lock.json packages[""].version (0.9.0) != package.json version (1.0.0)',
        );
    }, 15000);

    it('should fail if manifest.json is missing', () => {
        fs.unlinkSync(path.join(tempDir, 'manifest.json'));

        const result = runCheck();
        expect(result.status).toBe(1);
        expect(result.output).toContain('Missing manifest file');
    }, 15000);
});

describe('CI/CD Integration', () => {
    const rootDir = path.resolve(__dirname, '..');
    const workflowsDir = path.join(rootDir, '.github/workflows');

    it('should run check-version in release.yml', () => {
        const content = fs.readFileSync(path.join(workflowsDir, 'release.yml'), 'utf-8');
        expect(content).toContain('npm run check-version');
    });

    it('should run check-version in release-brat.yml', () => {
        const content = fs.readFileSync(path.join(workflowsDir, 'release-brat.yml'), 'utf-8');
        expect(content).toContain('npm run check-version');
    });
});
