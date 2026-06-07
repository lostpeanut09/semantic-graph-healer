import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

function collectTsFiles(dir: string, files: string[] = []): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectTsFiles(fullPath, files);
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
            files.push(fullPath);
        }
    }
    return files;
}

function findAnyPatterns(content: string): Array<{ line: number; text: string; pattern: string }> {
    const results: Array<{ line: number; text: string; pattern: string }> = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1;

        // Match `: any` — colon followed by whitespace and 'any', possibly in generics like `: any[]`
        // Also match `: any,` `: any)` `: any;`
        if (/:\s*any\b/.test(line) && !/\/\/.*:\s*any\b/.test(line) && !/\/\*.*:\s*any\b/.test(line)) {
            results.push({ line: lineNum, text: line.trim(), pattern: ': any' });
        }

        // Match `as any` — type assertion
        if (/\bas\s+any\b/.test(line) && !/\/\/.*\bas\s+any\b/.test(line) && !/\/\*.*\bas\s+any\b/.test(line)) {
            results.push({ line: lineNum, text: line.trim(), pattern: 'as any' });
        }

        // Match `<any>` — type parameter in angle brackets
        if (/<any[\s,>)]/.test(line) && !/\/\/.*<any[\s,>)]/.test(line) && !/\/\*.*<any[\s,>)]/.test(line)) {
            results.push({ line: lineNum, text: line.trim(), pattern: '<any>' });
        }
    }

    return results;
}

describe('G7 — ERR-04 ESLint gate: zero explicit `any` in src/', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const tsFiles = collectTsFiles(srcDir);

    it('src/ directory contains TypeScript files to scan', () => {
        expect(tsFiles.length).toBeGreaterThan(0);
    });

    it('zero `: any` type annotations in src/**/*.ts', () => {
        const violations: string[] = [];

        for (const file of tsFiles) {
            const content = fs.readFileSync(file, 'utf8');
            const matches = findAnyPatterns(content).filter((m) => m.pattern === ': any');
            for (const m of matches) {
                violations.push(`${file}:${m.line}: ${m.text}`);
            }
        }

        expect(violations, `Found ${violations.length} \`: any\` usages:\n${violations.join('\n')}`).toHaveLength(0);
    });

    it('zero `as any` type assertions in src/**/*.ts', () => {
        const violations: string[] = [];

        for (const file of tsFiles) {
            const content = fs.readFileSync(file, 'utf8');
            const matches = findAnyPatterns(content).filter((m) => m.pattern === 'as any');
            for (const m of matches) {
                violations.push(`${file}:${m.line}: ${m.text}`);
            }
        }

        expect(violations, `Found ${violations.length} \`as any\` usages:\n${violations.join('\n')}`).toHaveLength(0);
    });

    it('zero `<any>` type parameters in src/**/*.ts', () => {
        const violations: string[] = [];

        for (const file of tsFiles) {
            const content = fs.readFileSync(file, 'utf8');
            const matches = findAnyPatterns(content).filter((m) => m.pattern === '<any>');
            for (const m of matches) {
                violations.push(`${file}:${m.line}: ${m.text}`);
            }
        }

        expect(violations, `Found ${violations.length} \`<any>\` usages:\n${violations.join('\n')}`).toHaveLength(0);
    });
});
