/**
 * BoundedMap
 * 
 * An extension of the native Map that implements LRU (Least Recently Used) 
 * eviction to prevent unlimited memory growth.
 * 
 * LRU Policy:
 * - Reads (get) move the key to the end (MRU).
 * - Updates (set) move the key to the end.
 * - New insertions (set) evict the oldest entry (the first key) if maxSize is reached.
 * 
 * @template K - Type of the map keys.
 * @template V - Type of the map values.
 */
export class BoundedMap<K, V> extends Map<K, V> {
    /**
     * Creates a new BoundedMap.
     * @param maxSize - Maximum number of entries allowed before eviction.
     */
    constructor(private maxSize: number) {
        super();
    }

    /**
     * Retrieves a value and refreshes its position (Touch-on-get).
     * 
     * @param key - The key to retrieve.
     * @returns The value if found, undefined otherwise.
     */
    get(key: K): V | undefined {
        const value = super.get(key);
        if (value !== undefined) {
            // Touch-on-get: move key to end (most-recently used) to implement LRU-like eviction
            super.delete(key);
            super.set(key, value);
        }
        return value;
    }

    /**
     * Sets a value in the map. Triggers eviction of the oldest entry 
     * if size exceeds maxSize and the key is new.
     * 
     * @param key - The key to set.
     * @param value - The value to associate with the key.
     * @returns The BoundedMap instance.
     */
    set(key: K, value: V): this {
        if (this.size >= this.maxSize && !this.has(key)) {
            const first = this.keys().next().value as K | undefined;
            if (first !== undefined) this.delete(first);
        }
        return super.set(key, value);
    }
}
