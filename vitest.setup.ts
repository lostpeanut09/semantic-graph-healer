import { vi } from 'vitest';
import type * as Obsidian from 'obsidian';
import * as obsidianMock from './tests/obsidian';

vi.mock('obsidian', () => obsidianMock as unknown as typeof Obsidian);

// Suppress localstorage-file warnings
const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = function (this: void, warning: string | Error, ...args: unknown[]) {
    if (typeof warning === 'string' && warning.includes('--localstorage-file')) {
        return;
    }
    if (warning instanceof Error && warning.message.includes('--localstorage-file')) {
        return;
    }
    originalEmitWarning(warning, ...args as any[]);
};

const originalConsoleWarn = console.warn.bind(console);
console.warn = function (this: void, ...args: unknown[]) {
    if (typeof args[0] === 'string' && args[0].includes('--localstorage-file')) {
        return;
    }
    originalConsoleWarn(...args);
};

const originalConsoleError = console.error.bind(console);
console.error = function (this: void, ...args: unknown[]) {
    if (typeof args[0] === 'string' && args[0].includes('--localstorage-file')) {
        return;
    }
    originalConsoleError(...args);
};
