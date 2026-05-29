import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { JulesTest } from '../../src/core/JulesTest';

describe('Jules AI Reviewer Infrastructure Verification', () => {
    const workflowPath = path.resolve(process.cwd(), '.github/workflows/jules-review.yml');

    it('should have the jules-review.yml workflow file', () => {
        expect(fs.existsSync(workflowPath)).toBe(true);
    });

    it('should use the correct GitHub Action (google-labs-code/jules-invoke)', () => {
        const content = fs.readFileSync(workflowPath, 'utf8');
        expect(content).toContain('uses: google-labs-code/jules-invoke');
    });

    it('should have the JULES_API_KEY secret configured', () => {
        const content = fs.readFileSync(workflowPath, 'utf8');
        expect(content).toContain('jules_api_key: ${{ secrets.JULES_API_KEY }}');
    });

    it('should include core project review goals in the prompt', () => {
        const content = fs.readFileSync(workflowPath, 'utf8');

        expect(content).toContain('[BLOCKING]');
        expect(content).toContain('[WARN]');
        expect(content).toContain('[NIT]');
        expect(content).toContain('Adhere to the project standards defined in AGENTS.md');
    });

    it('should have a root AGENTS.md file with project standards', () => {
        const agentsPath = path.resolve(process.cwd(), 'AGENTS.md');
        expect(fs.existsSync(agentsPath)).toBe(true);

        const content = fs.readFileSync(agentsPath, 'utf8');
        expect(content).toContain('Security (Sentinel)');
        expect(content).toContain('Performance (Bolt)');
        expect(content).toContain('Accessibility (Palette)');
    });

    it('should trigger on pull requests with concurrency control', () => {
        const content = fs.readFileSync(workflowPath, 'utf8');
        expect(content).toContain('pull_request:');
        expect(content).toContain('concurrency:');
    });
});
