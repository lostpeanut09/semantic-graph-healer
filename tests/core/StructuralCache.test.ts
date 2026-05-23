import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StructuralCache } from '../../src/core/StructuralCache';

describe('StructuralCache (HARDEN-02: LRU & Negative Caching)', () => {
    let mockApp: any;
    let cache: StructuralCache<string>;

    beforeEach(() => {
        mockApp = {
            metadataCache: {
                on: vi.fn().mockReturnValue({}),
                offref: vi.fn(),
            },
            vault: {
                on: vi.fn().mockReturnValue({}),
                offref: vi.fn(),
            },
        };
        cache = new StructuralCache<string>(mockApp, { maxNodes: 3, ttlMs: 1000 });
    });

    it('should evict the least recently used item when capacity is reached', () => {
        cache.set('a', '1');
        cache.set('b', '2');
        cache.set('c', '3');

        // Access 'a' to make it most recently used
        cache.get('a');

        // Add 'd', should evict 'b' (the oldest unused)
        cache.set('d', '4');

        expect(cache.get('a')).toBe('1');
        expect(cache.get('b')).toBeUndefined();
        expect(cache.get('c')).toBe('3');
        expect(cache.get('d')).toBe('4');
    });

    it('should expire items after TTL', async () => {
        vi.useFakeTimers();

        cache.set('a', '1');
        expect(cache.get('a')).toBe('1');

        // Advance time by 2 seconds (TTL is 1s)
        vi.advanceTimersByTime(2000);

        expect(cache.get('a')).toBeUndefined();

        vi.useRealTimers();
    });

    it('should support explicit invalidation', () => {
        cache.set('a', '1');
        cache.set('b', '2');

        cache.invalidate('a');
        expect(cache.get('a')).toBeUndefined();
        expect(cache.get('b')).toBe('2');

        cache.invalidate(); // Clear all
        expect(cache.get('b')).toBeUndefined();
    });

    it('should handle negative caching (storing undefined/null)', () => {
        // In some cases we might want to cache that a result was NOT found
        // But our StructuralCache<T> 'get' returns T | undefined
        // If we store 'null' as a valid value T, we can test this.
        const nullCache = new StructuralCache<string | null>(mockApp);

        nullCache.set('missing', null);
        expect(nullCache.get('missing')).toBe(null);
        expect(nullCache.get('never-seen')).toBeUndefined();
    });

    it('should refresh TTL on access (LRU behavior)', async () => {
        vi.useFakeTimers();

        cache.set('a', '1');

        // Advance time by 800ms
        vi.advanceTimersByTime(800);

        // Access 'a', should refresh
        expect(cache.get('a')).toBe('1');

        // Advance time by another 800ms
        vi.advanceTimersByTime(800);

        // If not refreshed, it would have expired (Total 1600ms > 1000ms)
        expect(cache.get('a')).toBe('1');

        vi.useRealTimers();
    });
});
