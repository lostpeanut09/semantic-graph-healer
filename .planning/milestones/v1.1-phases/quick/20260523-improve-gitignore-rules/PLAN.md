---
task: improve-gitignore-rules
status: in-progress
created: 2026-05-23
---

# Plan: Improve .gitignore Exclusions

Update `.gitignore` to align with standard Obsidian plugin development, TypeScript compiling, Vitest testing, and IDE configurations (VS Code, JetBrains) to prevent metadata and workspace garbage from cluttering the repository.

## Tasks

- [ ] Identify standard TypeScript/Vitest/IDE and Obsidian files to ignore.
- [ ] Add the following entries to `.gitignore`:
    - IDE directories (`.vscode/`, `.idea/`)
    - Testing-specific outputs (`coverage/`, `.vitest/`)
    - Linter cache files (`.eslintcache`, `.stylelintcache`)
    - Vite temporary files (`*.ts.timestamp-*`)
    - Source maps (`*.js.map`, `*.css.map`, `*.map`)
    - Sensitive env files (`.env`, `.env.local`, `.env.development`, etc.)
    - Windows specific metadata (`desktop.ini`)
- [ ] Update `.planning/STATE.md` to add `improve-gitignore-rules` as in-progress / complete.
- [ ] Verify there are no newly tracked or untracked files showing up under `git status`.
- [ ] Commit the changes to git.

## Verification

- [ ] Verify `.gitignore` contains the new exclusions.
- [ ] Verify `git status` shows the updated `.gitignore` file.
- [ ] Verify `STATE.md` reflects the task completion.
