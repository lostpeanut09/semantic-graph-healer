# Phase 14 Implementation Plan: WSL Support & Dependency Validation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure seamless cross-platform support (Windows/WSL) and strict dependency validation.

**Architecture:**

- Declarative environment constraints in `package.json`.
- Unified path management via `pathe` to eliminate separator-based regressions.
- Robust, environment-aware Git hooks.
- CI/CD auditing for platform-agnostic code patterns.

**Tech Stack:**

- Node.js >= 24.0.0
- npm >= 11.0.0
- pathe
- Husky 9
- GitHub Actions

---

## Task Breakdown

### 1. Environment Enforcement & Dependencies (14-01)

- [ ] Update `package.json` with `engines` field.
- [ ] Create `.node-version` file.
- [ ] Install `pathe`.
- [ ] Add `postinstall` script for hybrid hook registration.

### 2. Path Normalization (14-02)

- [ ] Audit `src/` for manual path manipulation.
- [ ] Replace `split('/')`, manual `/` joining with `pathe` equivalents.
- [ ] Update `BaseAdapter` and descendants with `pathe` normalization.

### 3. Hook & CI/CD Hardening (14-03)

- [ ] Refactor `.husky/pre-commit` for POSIX compatibility.
- [ ] Refactor `.husky/pre-push` for environment detection.
- [ ] Update `.github/workflows/quality.yml` Node version.
- [ ] Add `verify-platform-agnostic` job to CI.

---

## Plans

- [ ] `14-01-PLAN.md` — Environment Enforcement & Dependencies
- [ ] `14-02-PLAN.md` — Path Normalization
- [ ] `14-03-PLAN.md` — Hook & CI/CD Hardening
