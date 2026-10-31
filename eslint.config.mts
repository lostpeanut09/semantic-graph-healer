import tseslint from 'typescript-eslint';
import obsidian from 'eslint-plugin-obsidianmd';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
	{
		ignores: [
			'main.js',
			'dist/**',
			'.planning/**',
			'test-vault/**',
			'node_modules/**',
			'eslint.config.mts',
			'knip.json',
			'esbuild.config.mjs',
			'types/**/*.d.ts',
		],
	},
	...tseslint.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	...obsidian.configs.recommended,
	{
		files: ['src/**/*.ts', 'tests/**/*.ts', '*.config.ts'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				project: 'tsconfig.json',
			},
		},
	},
	{
		rules: {
			'depend/ban-dependencies': 'off',
		},
	},
	prettier,
);
