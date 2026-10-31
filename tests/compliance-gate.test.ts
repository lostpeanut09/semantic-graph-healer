import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const gate = join(root, 'checks', 'phase2-checks.ps1');

describe('compliance gate script (checks/phase2-checks.ps1)', () => {
	it('checks/phase2-checks.ps1 exists', () => {
		expect(existsSync(gate)).toBe(true);
	});

	it('LICENSE is present at project root', () => {
		expect(existsSync(join(root, 'LICENSE'))).toBe(true);
	});

	it('README contains GPL-3.0', () => {
		const r = join(root, 'README.md');
		if (!existsSync(r)) expect.fail('README.md does not exist');
		const c = readFileSync(r, 'utf8');
		expect(c).toMatch(/GPL-3\.0|GNU General Public License/);
	});

	it('README has no-network statement', () => {
		const r = join(root, 'README.md');
		if (!existsSync(r)) expect.fail('README.md does not exist');
		const c = readFileSync(r, 'utf8').toLowerCase();
		expect(c).toMatch(/no network|no-network|offline|local-only|local only/);
	});

	it('README states minAppVersion 1.13.0', () => {
		const r = join(root, 'README.md');
		if (!existsSync(r)) expect.fail('README.md does not exist');
		const c = readFileSync(r, 'utf8');
		expect(c).toContain('1.13.0');
	});

	it('.gitignore excludes test-vault/', () => {
		const g = join(root, '.gitignore');
		if (!existsSync(g)) expect.fail('.gitignore does not exist');
		const c = readFileSync(g, 'utf8');
		expect(c).toMatch(/test-vault/);
	});

	it('.gitignore excludes .planning/', () => {
		const g = join(root, '.gitignore');
		if (!existsSync(g)) expect.fail('.gitignore does not exist');
		const c = readFileSync(g, 'utf8');
		expect(c).toMatch(/\.planning/);
	});

	it('.gitignore excludes main.js', () => {
		const g = join(root, '.gitignore');
		if (!existsSync(g)) expect.fail('.gitignore does not exist');
		const c = readFileSync(g, 'utf8');
		expect(c).toMatch(/main\.js/);
	});

	it('.gitignore excludes node_modules', () => {
		const g = join(root, '.gitignore');
		if (!existsSync(g)) expect.fail('.gitignore does not exist');
		const c = readFileSync(g, 'utf8');
		expect(c).toMatch(/node_modules/);
	});
});
