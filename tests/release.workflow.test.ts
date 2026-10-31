import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const path = (...p: string[]) => join(root, ...p);

describe('release workflow (release.yml)', () => {
	const file = path('.github', 'workflows', 'release.yml');

	it('.github/workflows/release.yml exists', () => {
		expect(existsSync(file)).toBe(true);
	});

	it('triggers on release', () => {
		if (!existsSync(file)) expect.fail(file + ' does not exist');
		const c = readFileSync(file, 'utf8');
		expect(c).toMatch(/^\s*release:|workflow_dispatch/);
	});

	it('uploads main.js, manifest.json, styles.css as release assets', () => {
		if (!existsSync(file)) expect.fail(file + ' does not exist');
		const c = readFileSync(file, 'utf8');
		expect(c).toContain('main.js');
		expect(c).toContain('manifest.json');
		expect(c).toContain('styles.css');
	});
});
