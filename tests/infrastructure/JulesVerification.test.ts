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

    it('should include all core project review rules in the prompt', () => {
        const content = fs.readFileSync(workflowPath, 'utf8');

        // Security (Sentinel)
        expect(content).toContain('Security (Sentinel)');
        expect(content).toContain('crypto.randomUUID()');
        expect(content).toContain('Reject any use of `Math.random()`');

        // Performance (Bolt)
        expect(content).toContain('Performance (Bolt)');
        expect(content).toContain('avoid JavaScript Array spreading');
        expect(content).toContain('inclusion-exclusion principle');

        // Accessibility (Palette)
        expect(content).toContain('Accessibility (Palette)');
        expect(content).toContain('aria-label');
        expect(content).toContain('aria-busy');
    });

    it('should require BLOCKING/WARN/NIT tagging in the response format', () => {
        const content = fs.readFileSync(workflowPath, 'utf8');
        expect(content).toContain('[BLOCKING]');
        expect(content).toContain('[WARN]');
        expect(content).toContain('[NIT]');
    });

    it('should trigger on pull requests for src and tests directories', () => {
        const content = fs.readFileSync(workflowPath, 'utf8');
        expect(content).toContain('pull_request:');
        expect(content).toContain("- 'src/**'");
        expect(content).toContain("- 'tests/**'");
    });
});
