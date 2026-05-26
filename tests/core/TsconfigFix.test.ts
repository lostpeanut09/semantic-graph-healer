import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const tsconfig = JSON.parse(readFileSync('./tsconfig.json', 'utf-8'));

describe('tsconfig.json Phase 20 Fix', () => {
    describe('moduleResolution', () => {
        it('must be set to "bundler" for verbatimModuleSyntax compatibility', () => {
            expect(tsconfig.compilerOptions.moduleResolution).toBe('bundler');
        });
    });

    describe('noEmit', () => {
        it('must be true to prevent tsc from emitting .js files', () => {
            expect(tsconfig.compilerOptions.noEmit).toBe(true);
        });
    });

    describe('types array', () => {
        it('must preserve obsidian-typings and node types', () => {
            expect(tsconfig.compilerOptions.types).toEqual(['obsidian-typings', 'node']);
        });
    });

    describe('verbatimModuleSyntax compatibility', () => {
        it('must have verbatimModuleSyntax enabled for strict imports', () => {
            expect(tsconfig.compilerOptions.verbatimModuleSyntax).toBe(true);
        });
    });

    describe('integration with build process', () => {
        it('must support ESNext module targets', () => {
            expect(tsconfig.compilerOptions.module).toBe('ESNext');
        });

        it('must target ES2022 or higher', () => {
            expect(tsconfig.compilerOptions.target).toBe('ES2022');
        });
    });
});