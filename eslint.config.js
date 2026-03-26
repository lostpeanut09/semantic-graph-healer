import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import prettierConfig from 'eslint-config-prettier';

export default defineConfig(
    eslint.configs.recommended,
    tseslint.configs.recommended,
    {
        plugins: {
            obsidianmd: obsidianmd,
        },
        languageOptions: {
            parserOptions: {
                project: ['./tsconfig.json'],
                tsconfigRootDir: import.meta.dirname,
            },
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
        },
    },
    {
        ignores: [
            'main.js',
            'esbuild.config.mjs',
            'eslint.config.js',
            'node_modules/',
            'main.ts.final_stage_bak',
            'main.ts.perfect_bak',
            'HealerLogic.test.ts',
        ],
    },
    prettierConfig,
);
