import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, unmount } from 'svelte';
import GraphRagView from '../../src/views/GraphRagView.svelte';

// Mock Obsidian
vi.mock('obsidian', () => ({
    Notice: vi.fn(),
}));

describe('GraphRagView', () => {
    let pluginMock: any;

    beforeEach(() => {
        pluginMock = {
            graphRag: {
                query: vi.fn(),
            },
            app: {
                vault: {
                    adapter: {
                        getResourcePath: vi.fn().mockReturnValue('mock-path'),
                    },
                },
            },
        };
    });

    it('renders search bar', () => {
        const host = document.createElement('div');
        const instance = mount(GraphRagView, {
            target: host,
            props: { plugin: pluginMock },
        });

        expect(host.querySelector('input')).toBeTruthy();
        expect(host.querySelector('button')?.textContent).toContain('Search');

        unmount(instance);
    });

    it('executes query and displays answer', async () => {
        const mockResult = {
            answer: 'This is a test answer.',
            communities: [
                {
                    communityId: 1,
                    summary: 'Cluster 1',
                    score: 0.9,
                    notes: ['note1.md'],
                },
            ],
        };
        pluginMock.graphRag.query.mockResolvedValue(mockResult);

        const host = document.createElement('div');
        const instance = mount(GraphRagView, {
            target: host,
            props: { plugin: pluginMock },
        });

        const input = host.querySelector('input')!;
        input.value = 'test query';
        input.dispatchEvent(new Event('input'));

        const button = host.querySelector('button')!;
        await button.click();

        // Wait for async search
        await vi.waitFor(() => {
            expect(host.querySelector('.healer-rag-answer')?.textContent).toContain('This is a test answer.');
            expect(host.querySelector('.healer-rag-context')).toBeTruthy();
            expect(host.querySelector('.healer-comm-pill')?.textContent).toContain('Cluster 1');
        });

        unmount(instance);
    });
});
