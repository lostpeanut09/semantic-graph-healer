import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

function collectTsFiles(dir: string, files: string[] = []): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules') {
            collectTsFiles(fullPath, files);
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
            files.push(fullPath);
        }
    }
    return files;
}

describe('G8 — Sentinel rule: zero Math.random() in src/', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const tsFiles = collectTsFiles(srcDir);

    it('src/ directory contains TypeScript files to scan', () => {
        expect(tsFiles.length).toBeGreaterThan(0);
    });

    it('zero Math.random() calls in src/**/*.ts', () => {
        const violations: string[] = [];

        for (const file of tsFiles) {
            const content = fs.readFileSync(file, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const lineNum = i + 1;
                if (/Math\.random\s*\(/.test(lines[i])) {
                    const trimmed = lines[i].trim();
                    if (!trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*')) {
                        violations.push(`${file}:${lineNum}: ${trimmed}`);
                    }
                }
            }
        }

        expect(
            violations,
            `Found ${violations.length} Math.random() call(s) — AGENTS.md Sentinel rule requires crypto.randomUUID() via generateId:\n${violations.join('\n')}`,
        ).toHaveLength(0);
    });
});

describe('G9 — Bolt rule: Set spreading in src/', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const tsFiles = collectTsFiles(srcDir);

    it('zero [...setVariable] patterns where variable name suggests a Set/iterable', () => {
        const violations: string[] = [];

        for (const file of tsFiles) {
            const content = fs.readFileSync(file, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const lineNum = i + 1;
                const match = lines[i].match(/\[\.\.\.(\w+)\]/);
                if (match) {
                    const varName = match[1].toLowerCase();
                    if (varName.includes('set') || varName === 'seen') {
                        const trimmed = lines[i].trim();
                        if (!trimmed.startsWith('//') && !trimmed.startsWith('*')) {
                            violations.push(`${file}:${lineNum}: ${trimmed}`);
                        }
                    }
                }
            }
        }

        expect(
            violations,
            `Found ${violations.length} [...setVariable] pattern(s) suggesting Set spreading:\n${violations.join('\n')}`,
        ).toHaveLength(0);
    });

    it('zero Array.from(setVariable) in hot-path files (excludes utility one-off conversions)', () => {
        const violations: string[] = [];

        for (const file of tsFiles) {
            if (file.includes('HealerUtils.ts')) continue;

            const content = fs.readFileSync(file, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const lineNum = i + 1;
                const match = lines[i].match(/Array\.from\s*\((\w+)/);
                if (match) {
                    const varName = match[1].toLowerCase();
                    if (varName.includes('set') || varName === 'seen') {
                        const trimmed = lines[i].trim();
                        if (!trimmed.startsWith('//') && !trimmed.startsWith('*')) {
                            violations.push(`${file}:${lineNum}: ${trimmed}`);
                        }
                    }
                }
            }
        }

        expect(
            violations,
            `Found ${violations.length} Array.from(setVariable) pattern(s) in non-utility hot paths:\n${violations.join('\n')}`,
        ).toHaveLength(0);
    });
});
