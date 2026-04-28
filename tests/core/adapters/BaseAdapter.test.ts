import { describe, it, expect, vi } from 'vitest';
import { BaseAdapter } from '../../../src/core/adapters/BaseAdapter';
import { SemanticLinkEdge } from '../../../src/core/adapters/types';

// Concrete subclass for testing
class TestAdapter extends BaseAdapter {
    public readonly id = 'test-adapter';
    public available = true;
    public links: SemanticLinkEdge[] = [];
    public throws = false;
    public getLinksCalls = 0;
    public destroyedCalled = false;

    public isAvailable(): boolean {
        return this.available;
    }

    public async getLinks(): Promise<SemanticLinkEdge[]> {
        this.getLinksCalls++;
        if (this.throws) throw new Error('boom');
        return this.links;
    }

    public invalidate(_path?: string): void {}

    protected override onDestroy(): void {
        this.destroyedCalled = true;
    }

    // Expose protected helpers for testing
    public testGetPlugin<T>(id: string) {
        return this.getPlugin<T>(id);
    }
    public testIsPluginAvailable(id: string) {
        return this.isPluginAvailable(id);
    }
    public testNormalize(path?: string, source?: string) {
        return this.normalizeInvalidatePath(path, source);
    }
}

describe('BaseAdapter Hardening', () => {
    it('lifecycle: destroy() should set isDestroyed and call onDestroy', () => {
        const app = {} as any;
        const adapter = new TestAdapter(app);

        expect(adapter.isDestroyed).toBe(false);
        expect(adapter.destroyedCalled).toBe(false);

        adapter.destroy();

        expect(adapter.isDestroyed).toBe(true);
        expect(adapter.destroyedCalled).toBe(true);

        // Idempotency check
        adapter.destroy();
        expect(adapter.isDestroyed).toBe(true);
    });

    it('getLinksSafe: should return [] if adapter is destroyed', async () => {
        const adapter = new TestAdapter({} as any);
        adapter.links = [{ sourcePath: 'a', targetPath: 'b', type: 'wikilink' }];

        adapter.destroy();
        const res = await adapter.getLinksSafe();

        expect(res).toEqual([]);
        expect(adapter.getLinksCalls).toBe(0);
    });

    it('getLinksSafe: should return [] if adapter is not available', async () => {
        const adapter = new TestAdapter({} as any);
        adapter.available = false;

        const res = await adapter.getLinksSafe();

        expect(res).toEqual([]);
        expect(adapter.getLinksCalls).toBe(0);
    });

    it('getLinksSafe: should return [] and log error if getLinks throws', async () => {
        const adapter = new TestAdapter({} as any);
        adapter.throws = true;

        const res = await adapter.getLinksSafe();

        expect(res).toEqual([]);
        expect(adapter.getLinksCalls).toBe(1);
    });

    it('getLinksSafe: should return data if healthy', async () => {
        const adapter = new TestAdapter({} as any);
        const mockLinks: SemanticLinkEdge[] = [{ sourcePath: 'a', targetPath: 'b', type: 'wikilink' }];
        adapter.links = mockLinks;

        const res = await adapter.getLinksSafe();

        expect(res).toEqual(mockLinks);
        expect(adapter.getLinksCalls).toBe(1);
    });

    it('helpers: isPluginAvailable should handle Obsidian internal app shape', () => {
        const mockApp = {
            plugins: {
                enabledPlugins: new Set(['p1', 'p2']),
                getPlugin: (id: string) => (id === 'p1' ? { api: {} } : null),
            },
        };

        const adapter = new TestAdapter(mockApp as any);

        expect(adapter.testIsPluginAvailable('p1')).toBe(true);
        expect(adapter.testIsPluginAvailable('p2')).toBe(false); // No instance returned by getPlugin
        expect(adapter.testIsPluginAvailable('p3')).toBe(false); // Not in enabledPlugins
    });
});
