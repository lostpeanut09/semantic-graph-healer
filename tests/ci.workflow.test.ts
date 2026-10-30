import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const path = (...p: string[]) => join(root, ...p);

describe('quality CI workflow (quality.yml)', () => {
	const file = path('.github', 'workflows', 'quality.yml');

	it('.github/workflows/quality.yml exists', () => {
		expect(existsSync(file)).toBe(true);
	});

	it('triggers on push or workflow_dispatch', () => {
		if (!existsSync(file)) expect.fail(file + ' does not exist');
		const c = readFileSync(file, 'utf8');
		expect(c).toMatch(/workflow_dispatch|^\s*push:|^\s*pull_request:/m);
	});

	it('uses Node 24 and 26 in matrix', () => {
		if (!existsSync(file)) expect.fail(file + ' does not exist');
		const c = readFileSync(file, 'utf8');
		expect(c).toMatch(/['"]24['"]/);
		expect(c).toMatch(/['"]26['"]/);
	});

	it('runs tsc typecheck', () => {
		if (!existsSync(file)) expect.fail(file + ' does not exist');
		const c = readFileSync(file, 'utf8');
		expect(c).toMatch(/tsc\s|typecheck|npm run build|npm run typecheck/);
	});

	it('runs eslint', () => {
		if (!existsSync(file)) expect.fail(file + ' does not exist');
		const c = readFileSync(file, 'utf8');
		expect(c).toMatch(/eslint/);
	});

	it('runs knip', () => {
		if (!existsSync(file)) expect.fail(file + ' does not exist');
		const c = readFileSync(file, 'utf8');
		expect(c).toMatch(/knip/);
	});

	it('runs vitest', () => {
		if (!existsSync(file)) expect.fail(file + ' does not exist');
		const c = readFileSync(file, 'utf8');
		expect(c).toMatch(/vitest/);
	});
});
