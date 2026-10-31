import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const readme = join(root, 'README.md');

describe('README.md compliance', () => {
	it('README.md exists at project root', () => {
		expect(existsSync(readme)).toBe(true);
	});

	it('contains GPL-3.0 license reference', () => {
		if (!existsSync(readme)) expect.fail('README.md does not exist');
		const c = readFileSync(readme, 'utf8');
		expect(c).toMatch(/GPL-3\.0|GNU General Public License/);
	});

	it('contains test-vault development statement', () => {
		if (!existsSync(readme)) expect.fail('README.md does not exist');
		const c = readFileSync(readme, 'utf8').toLowerCase();
		expect(c).toMatch(/test-vault|test vault/);
	});

	it('contains no-network statement', () => {
		if (!existsSync(readme)) expect.fail('README.md does not exist');
		const c = readFileSync(readme, 'utf8').toLowerCase();
		expect(c).toMatch(/no network|no-network|offline|local-only|local only/);
	});

	it('contains minAppVersion 1.13.0', () => {
		if (!existsSync(readme)) expect.fail('README.md does not exist');
		const c = readFileSync(readme, 'utf8');
		expect(c).toContain('1.13.0');
	});
});
