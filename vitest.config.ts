import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			obsidian: '/tests/obsidian.ts',
		},
	},
	test: {
		globals: true,
		environment: 'jsdom',
		include: ['tests/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'lcov'],
			exclude: ['**/*.test.ts', '**/obsidian.ts'],
		},
	},
});
