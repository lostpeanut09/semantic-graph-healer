import { describe, expect, it } from 'vitest';
import { BoundedMap } from '../../../src/core/utils/BoundedMap';

describe('BoundedMap', () => {
    it('does not exceed max size and evicts oldest entry (FIFO initial)', () => {
        const map = new BoundedMap<string, number>(3);

        map.set('a', 1);
        map.set('b', 2);
        map.set('c', 3);
        expect(map.size).toBe(3);

        map.set('d', 4);
        expect(map.size).toBe(3);
        expect(map.has('a')).toBe(false); // oldest evicted
        expect(map.has('d')).toBe(true);
    });

    it('evicts least recently used after access pattern (touch-on-get)', () => {
        const map = new BoundedMap<string, number>(3);

        map.set('a', 1);
        map.set('b', 2);
        map.set('c', 3);

        // Access a to make it recently used
        expect(map.get('a')).toBe(1);

        // Insert d — should evict b (least recently accessed), not a nor c
        map.set('d', 4);

        expect(map.has('a')).toBe(true); // touched → still present
        expect(map.has('b')).toBe(false); // LRU → evicted
        expect(map.has('c')).toBe(true); // not accessed but inserted after b
        expect(map.has('d')).toBe(true);
    });

    it('does not evict on update of existing key', () => {
        const map = new BoundedMap<string, number>(2);

        map.set('a', 1);
        map.set('b', 2);
        map.set('a', 3); // update

        expect(map.size).toBe(2);
        expect(map.get('a')).toBe(3);
        expect(map.get('b')).toBe(2);
    });
});
