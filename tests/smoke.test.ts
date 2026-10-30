import { describe, it, expect } from 'vitest';
import { mockApp } from './obsidian';

describe('smoke', () => {
	it('mocks obsidian app', () => {
		expect(mockApp).toBeDefined();
		expect(mockApp.vault).toBeDefined();
	});

	it('loads settings', async () => {
		const { DEFAULT_SETTINGS, validateSettings } = await import('../src/settings');
		expect(DEFAULT_SETTINGS.ai.enabled).toBe(false);
		const result = validateSettings({ ai: { provider: 'invalid' } });
		expect(result.ai.provider).toBe('disabled');
	});
});
