import { vi } from 'vitest';

vi.mock('obsidian', async () => {
    const obsidianMock = await import('./tests/obsidian');
    return obsidianMock;
});
