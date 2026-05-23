import { vi } from 'vitest';
import type * as Obsidian from 'obsidian';
import * as obsidianMock from './tests/obsidian';

vi.mock('obsidian', () => obsidianMock as unknown as typeof Obsidian);

// Define global.URL for vitest worker environments that might not have it
if (typeof global !== 'undefined' && !global.URL) {
  (global as any).URL = {};
}

// Define global.Worker for vitest worker environments
if (typeof global !== 'undefined' && !global.Worker) {
  (global as any).Worker = class MockWorker {};
}
