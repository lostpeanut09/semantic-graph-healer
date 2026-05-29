import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Workflow Compliance Infrastructure Verification', () => {
    it('should have .yamllint.yml with 4-space indentation', () => {
        const yamllintPath = path.resolve(process.cwd(), '.yamllint.yml');
        expect(fs.existsSync(yamllintPath)).toBe(true);
        const content = fs.readFileSync(yamllintPath, 'utf8');
        expect(content).toContain('spaces: 4');
    });

    it('should use 4-space indentation in all GitHub workflows', () => {
        const workflowsDir = path.resolve(process.cwd(), '.github/workflows');
        const workflows = fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.yml'));

        for (const workflow of workflows) {
            const content = fs.readFileSync(path.join(workflowsDir, workflow), 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (line.trim().length === 0) continue;
                const match = line.match(/^(\s*)/);
                const indent = match ? match[0].length : 0;
                // YAML indentation should be multiple of 4 for blocks.
                // However, list item properties are offset by 2 spaces (due to "- ")
                // So we allow (indent % 4 === 0) OR (indent % 4 === 2).
                const isValid = indent % 4 === 0 || indent % 4 === 2;
                expect(isValid, `Workflow ${workflow} line ${i + 1} has invalid indentation: ${indent}`).toBe(true);
            }
        }
    });

    it('should not contain hallucinated GitHub Action versions (@v5+)', () => {
        const workflowsDir = path.resolve(process.cwd(), '.github/workflows');
        const workflows = fs.readdirSync(workflowsDir).filter((f) => f.endsWith('.yml'));

        for (const workflow of workflows) {
            const content = fs.readFileSync(path.join(workflowsDir, workflow), 'utf8');
            // Check for @v followed by 5, 6, 7, 8, or 9
            const hallucinatedMatch = content.match(/@v[5-9]/);
            expect(
                hallucinatedMatch,
                `Workflow ${workflow} contains hallucinated version: ${hallucinatedMatch}`,
            ).toBeNull();
        }
    });
});
