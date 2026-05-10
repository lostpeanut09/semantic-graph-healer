/* eslint-disable import/no-nodejs-modules */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
    plugins: [svelte()],
    resolve: {
        alias: {
            obsidian: fileURLToPath(new URL('./tests/obsidian.ts', import.meta.url)),
        },
    },
    test: {
        environment: 'jsdom',
        deps: {
            inline: ['obsidian'],
        },
        setupFiles: ['@vitest/web-worker'],
        exclude: ['**/node_modules/**', '**/.kilo/**'],
    },
});
