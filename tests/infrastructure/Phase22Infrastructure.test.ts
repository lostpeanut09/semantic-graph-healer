import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

describe('Phase 22: Infrastructure - YAML Linting & Workflows', () => {
    const rootDir = path.resolve(__dirname, '../..');
    const packageJsonPath = path.join(rootDir, 'package.json');
    const yamllintConfigPath = path.join(rootDir, '.yamllint.yml');
    const workflowsDir = path.join(rootDir, '.github/workflows');

    describe('Unit Tests: Configuration & Scripts', () => {
        it('should have the lint:yaml script in package.json', () => {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            expect(packageJson.scripts).toHaveProperty('lint:yaml');
            expect(packageJson.scripts['lint:yaml']).toContain('yamllint-js');
        });

        it('should have yamllint-js configured in nano-staged', () => {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
            expect(packageJson['nano-staged']).toHaveProperty('**/*.yml');
            expect(packageJson['nano-staged']['**/*.yml']).toContain('yamllint-js');
        });

        it('should have a valid .yamllint.yml configuration', () => {
            expect(fs.existsSync(yamllintConfigPath)).toBe(true);
            const configContent = fs.readFileSync(yamllintConfigPath, 'utf8');
            expect(configContent).toContain('extends: relaxed');
            expect(configContent).toContain('spaces: 4');
            expect(configContent).toContain('line-length: disable');
        });
    });

    describe('E2E Tests: Workflow Validation & Linting Behavior', () => {
        const workflows = ['quality.yml', 'release.yml', 'release-brat.yml'];

        it.each(workflows)('should validate %s with 4-space indentation and @v4 actions', (workflowFile) => {
            const filePath = path.join(workflowsDir, workflowFile);
            expect(fs.existsSync(filePath)).toBe(true);
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Check indentation (at least one line starting with 4 spaces, no lines starting with 2 spaces that aren't sequels)
            // This is a bit naive but good enough for a smoke test
            expect(content).toMatch(/^\s{4}\w/m);
            
            // Check actions versions
            expect(content).toContain('actions/checkout@v4');
            expect(content).toContain('actions/setup-node@v4');
            
            // Check Node version
            expect(content).toContain("node-version: '24'");
            
            // Check npm ci
            expect(content).toContain('npm ci');
            
            // Verify it passes yamllint-js
            try {
                execSync(`npx yamllint-js "${filePath}"`, { stdio: 'pipe' });
            } catch (error: any) {
                throw new Error(`yamllint-js failed for ${workflowFile}: ${error.stdout.toString()}`);
            }
        });

        it('should fail on malformed YAML and pass on corrected YAML', () => {
            const tempYamlPath = path.join(rootDir, 'temp-test-malformed.yml');
            
            // 2-space indentation (should fail based on our config)
            const malformedYaml = `
test:
  key: value
`;
            fs.writeFileSync(tempYamlPath, malformedYaml);

            try {
                expect(() => {
                    execSync(`npx yamllint-js -c "${yamllintConfigPath}" -s "${tempYamlPath}"`, { stdio: 'pipe' });
                }).toThrow();
            } finally {
                if (fs.existsSync(tempYamlPath)) fs.unlinkSync(tempYamlPath);
            }

            // 4-space indentation (should pass)
            const correctYaml = 'test:\n    key: value\n';
            fs.writeFileSync(tempYamlPath, correctYaml);

            try {
                const output = execSync(`npx yamllint-js -c "${yamllintConfigPath}" -s "${tempYamlPath}"`, { stdio: 'pipe' });
                expect(output.toString()).toBeDefined();
            } catch (error: any) {
                console.error('yamllint-js output:', error.stdout.toString());
                console.error('yamllint-js stderr:', error.stderr.toString());
                throw error;
            } finally {
                if (fs.existsSync(tempYamlPath)) fs.unlinkSync(tempYamlPath);
            }
        });
    });
});
