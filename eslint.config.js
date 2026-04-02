import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import prettierConfig from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';

export default defineConfig([
    // 1. Base JS Recommended
    eslint.configs.recommended,

    // 2. Base TypeScript Recommended for all JS/TS files
    ...tseslint.configs.recommended,

    // 3. Type-checked rules (only for TS files)
    {
        files: ['**/*.ts'],
        extends: [...tseslint.configs.recommendedTypeChecked],
        languageOptions: {
            // Browser Globals
            globals: {
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                requestAnimationFrame: 'readonly',
                cancelAnimationFrame: 'readonly',
                fetch: 'readonly',
                self: 'readonly',
                crypto: 'readonly',
                btoa: 'readonly',
                atob: 'readonly',
                // Node Globals (needed for config files/tools)
                process: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                require: 'readonly',
                module: 'readonly',
            },
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },

    // 4. Disable type-checked rules on JS files (config files, etc.)
    {
        files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
        extends: [tseslint.configs.disableTypeChecked],
        languageOptions: {
            globals: {
                process: 'readonly',
                __dirname: 'readonly',
                import: 'readonly',
            },
        },
    },

    // 5. Obsidian Plugin Recommended (Best practices for review)
    ...obsidianmd.configs.recommended,

    // 6. Custom overrides and Healer specific rules
    {
        files: ['**/*.ts'],
        rules: {
            // Downgrade strict Type-Checking to Warnings for Release V1.5.0
            '@typescript-eslint/restrict-template-expressions': 'warn',
            '@typescript-eslint/no-floating-promises': 'warn',
            '@typescript-eslint/no-misused-promises': 'warn',
            '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
            '@typescript-eslint/require-await': 'warn',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unsafe-assignment': 'warn',
            '@typescript-eslint/no-unsafe-member-access': 'warn',
            '@typescript-eslint/no-unsafe-call': 'warn',
            '@typescript-eslint/no-unsafe-return': 'warn',
            '@typescript-eslint/no-unsafe-argument': 'warn',
            '@typescript-eslint/no-unsafe-function-type': 'warn',
            '@typescript-eslint/no-unused-vars': 'warn',

            // Obsidian specific
            'obsidianmd/no-tfile-tfolder-cast': 'warn',
            'obsidianmd/ui/sentence-case': 'warn',
            'obsidianmd/no-static-styles-assignment': 'warn',

            'no-console': ['warn', { allow: ['warn', 'error', 'debug', 'info'] }],
        },
    },

    // 7. Ignore globali
    {
        ignores: [
            'worker.js',
            'main.js',
            'esbuild.config.mjs',
            'eslint.config.js',
            'eslint.config.mjs',
            'node_modules/',
            '.kilo/',
            '**/*.test.ts',
            '**/*.bak',
        ],
    },

    // 8. Prettier in coda
    prettierConfig,
]);
