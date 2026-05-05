import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HealerLogger } from '../../../src/core/HealerUtils';
import { BaseAdapter } from '../../../src/core/adapters/BaseAdapter';

class TestAdapter extends BaseAdapter {
    public readonly id = 'test-adapter';

    public available = true;
    public throwOnAvailable = false;
    public throwOnGetLinks = false;

    public getLinksCalls = 0;
    public destroyCalls = 0;

    public isAvailable(): boolean {
        if (this.throwOnAvailable) throw new Error('boom-available');
        return this.available;
    }

    public async getLinks() {
        this.getLinksCalls++;
        if (this.throwOnGetLinks) throw new Error('boom-links');
        return [];
    }

    public invalidate(): void {}

    protected onDestroy(): void {
        this.destroyCalls++;
    }

    // expose protected for test
    public _isPluginAvailable(id: string): boolean {
        // @ts-expect-error testing protected
        return this.isPluginAvailable(id);
    }

    public _logDebug(msg: string): void {
        // @ts-expect-error testing protected
        return this.logDebug(msg);
    }
}

describe('BaseAdapter', () => {
    let debugSpy: any;

    beforeEach(() => {
        debugSpy = vi.spyOn(HealerLogger, 'debug').mockImplementation(() => {});
    });

    afterEach(() => {
        debugSpy.mockRestore();
    });

    it('destroy() is idempotent and calls onDestroy exactly once', () => {
        const a = new TestAdapter({} as any);
        a.destroy();
        a.destroy();
        expect(a.isDestroyed).toBe(true);
        expect(a.destroyCalls).toBe(1);
    });

    it('getLinksSafe returns [] if destroyed', async () => {
        const a = new TestAdapter({} as any);
        a.destroy();
        const res = await a.getLinksSafe();
        expect(res).toEqual([]);
        expect(a.getLinksCalls).toBe(0);
    });

    it('getLinksSafe returns [] if isAvailable throws', async () => {
        const a = new TestAdapter({} as any);
        a.throwOnAvailable = true;
        const res = await a.getLinksSafe();
        expect(res).toEqual([]);
        expect(a.getLinksCalls).toBe(0);
    });

    it('getLinksSafe returns [] if getLinks throws', async () => {
        const a = new TestAdapter({} as any);
        a.throwOnGetLinks = true;
        const res = await a.getLinksSafe();
        expect(res).toEqual([]);
        expect(a.getLinksCalls).toBe(1);
    });

    it('logDebug respects debug flag', () => {
        const aNoDebug = new TestAdapter({} as any, false);
        aNoDebug._logDebug('nope');
        expect(debugSpy).toHaveBeenCalledTimes(0);

        const aDebug = new TestAdapter({} as any, true);
        aDebug._logDebug('yep');
        expect(debugSpy).toHaveBeenCalledTimes(1);
    });

    it('isPluginAvailable does not throw if enabledPlugins is an array', () => {
        const app = {
            plugins: {
                enabledPlugins: ['x'],
                getPlugin: (id: string) => (id === 'x' ? {} : null),
            },
        };
        const a = new TestAdapter(app as any);
        expect(() => a._isPluginAvailable('x')).not.toThrow();
        expect(a._isPluginAvailable('x')).toBe(true);
    });
});
