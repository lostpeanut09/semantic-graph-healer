import { describe, it, expect, vi } from 'vitest';
import { App, Plugin } from 'obsidian';
import SemanticGraphHealerPlugin from '../src/main';

/**
 * main.spec.ts — plugin lifecycle behaviour.
 * Uses the project's class-based mock from tests/obsidian.ts (resolved via the
 * vitest alias `obsidian → /tests/obsidian.ts`), NOT a plain object literal.
 */
describe('SemanticGraphHealerPlugin', () => {
	const makePlugin = () => {
		const app = new App();
		const manifest = {
		id: 'semantic-graph-healer',
		name: 'Semantic Graph Healer',
		version: '1.0.0',
		minAppVersion: '1.13.0',
		description: 'Diagnoses and repairs structural problems in large Obsidian knowledge graphs',
		author: 'lostpeanut09',
	};
		return new SemanticGraphHealerPlugin(app, manifest);
	};

	describe('class & instantiation', () => {
		it('Plugin class exists', () => {
			expect(SemanticGraphHealerPlugin).toBeDefined();
			expect(typeof SemanticGraphHealerPlugin).toBe('function');
		});

		it('can be instantiated with a mocked App', () => {
			const plugin = makePlugin();
			expect(plugin).toBeDefined();
			expect(plugin instanceof Plugin).toBe(true);
		});
	});

	describe('onload', () => {
		it('does not throw', async () => {
			const plugin = makePlugin();
			await expect(plugin.onload()).resolves.not.toThrow();
		});

		it('registers command sgl-run-diagnostics via addCommand', async () => {
			const plugin = makePlugin();
			const spy = vi.spyOn(plugin, 'addCommand');
			await plugin.onload();
			expect(spy).toHaveBeenCalledWith(
				expect.objectContaining({ id: 'sgl-run-diagnostics' })
			);
		});

		it('registers settings tab via addSettingTab', async () => {
			const plugin = makePlugin();
			const spy = vi.spyOn(plugin, 'addSettingTab');
			await plugin.onload();
			expect(spy).toHaveBeenCalled();
		});
	});

	describe('onunload', () => {
		it('does not throw', () => {
			const plugin = makePlugin();
			expect(() => plugin.onunload()).not.toThrow();
		});
	});
});
