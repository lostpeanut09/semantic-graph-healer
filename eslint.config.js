import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
    {
        plugins: {
            obsidianmd: obsidianmd,
        },
        rules: {
            'obsidianmd/ui/sentence-case': 'error',
            'obsidianmd/no-static-styles-assignment': 'error',
            'obsidianmd/hardcoded-config-path': 'warn',
            'obsidianmd/no-forbidden-elements': 'error',
            'obsidianmd/no-sample-code': 'error',

            '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true, allowBoolean: true }],
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/no-unnecessary-type-assertion': 'error',
            '@typescript-eslint/require-await': 'error',
            '@typescript-eslint/no-explicit-any': 'error',

            'no-console': ['error', { allow: ['warn', 'error', 'debug'] }],
        },
    },
    {
        ignores: ['main.js', 'esbuild.config.mjs', 'eslint.config.js', 'node_modules/', '**/*.test.ts', '**/*.bak'],
    },
    prettierConfig,
);
