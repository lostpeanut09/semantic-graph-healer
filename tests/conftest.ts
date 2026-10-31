import { App, Plugin } from 'obsidian';

/**
 * conftest.ts — shared test fixtures for Phase 02.
 * Provides factory helpers consumed by *.test.ts files via the
 * vitest alias `obsidian → /tests/obsidian.ts`.
 */

export function createMockApp(): App {
	return new App();
}

export function createMockManifest(id = 'semantic-graph-healer', version = '1.0.0') {
	return { id, version };
}

export interface TestPluginInstance {
	app: App;
	manifest: { id: string; version: string };
}

export function makePlugin<T extends Plugin>(
	Ctor: new (app: App, manifest: unknown) => T,
): TestPluginInstance {
	const app = createMockApp();
	const manifest = createMockManifest();
	return { app, manifest, plugin: new Ctor(app, manifest) } as unknown as TestPluginInstance & {
		plugin: T;
	};
}
