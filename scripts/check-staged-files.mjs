import { execSync } from 'node:child_process';

try {
    // Get all staged files
    const stagedFiles = execSync('git diff --cached --name-only').toString().trim().split('\n').filter(Boolean);

    // Check if any staged file is inside .planning/
    const forbiddenFiles = stagedFiles.filter((file) => file.startsWith('.planning/'));

    if (forbiddenFiles.length > 0) {
        console.error(`\n\x1b[31m[ERROR] Attempted to stage internal planning artifacts.\x1b[0m`);
        console.error(`\x1b[33mForbidden files detected:\x1b[0m`);
        forbiddenFiles.forEach((f) => console.error(`  - ${f}`));
        console.error(`\nThe .planning/ directory must remain local and should not be committed to the repository.\n`);
        console.error(`Please unstage these files using: git restore --staged <file>...\n`);
        process.exit(1);
    }
} catch (error) {
    console.error('Failed to check staged files.', error.message);
    process.exit(1);
}

process.exit(0);
