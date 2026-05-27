import fs from 'node:fs';
import { execSync } from 'node:child_process';

const msgPath = process.argv[2];
if (!msgPath) {
    console.error('No commit message path provided.');
    process.exit(1);
}

const msg = fs.readFileSync(msgPath, 'utf8');

// Rules based on GEMINI.md Conventions
const forbiddenPatterns = [
    /\(?phase-?\d+\)?/i,
    /\(?wave-?\d+\)?/i,
    /\(\d{2}-\d{2}\)/,
    /\(\d{2}\)/,
    /\b\d{2}-\d{2}-PLAN\.md\b/,
    /\bPLAN\.md\b/,
    /\bSUMMARY\.md\b/,
    /\.planning\//,
];

for (const pattern of forbiddenPatterns) {
    if (pattern.test(msg)) {
        console.error(`\n\x1b[31m[ERROR] Commit message violates project privacy conventions.\x1b[0m`);
        console.error(`\x1b[33mForbidden pattern detected:\x1b[0m ${pattern}`);
        console.error(`\x1b[33mCommit message:\x1b[0m\n${msg}`);
        console.error(
            `Please focus on the technical/functional change and remove workflow-specific tags (e.g., phase-X, PLAN.md).\n`,
        );
        process.exit(1);
    }
}

process.exit(0);
