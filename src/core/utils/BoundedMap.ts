/**
 * Bounded Map con LRU (Least Recently Used) eviction per prevenire crescita illimitata di memoria.
 *
 * Politica LRU:
 * - Inserimento nuova chiave: se size >= maxSize, evicta la entry meno recentemente accessata (la prima).
 * - Lettura (get): implementa "touch-on-get", spostando la chiave letta alla fine dell'ordine di inserimento (MRU).
 * - Update di chiave esistente (set): sposta la chiave alla fine dell'ordine di inserimento.
 *
 * La condizione di eviction `size >= maxSize && !this.has(key)` garantisce:
 * - Gli update non triggerano l'eviction, in quanto la dimensione non aumenta.
 * - Solo l'inserimento di nuove chiavi quando il limite è raggiunto causa l'eviction.
 */
export class BoundedMap<K, V> extends Map<K, V> {
    constructor(private maxSize: number) {
        super();
    }

    get(key: K): V | undefined {
        const value = super.get(key);
        if (value !== undefined) {
            // Touch-on-get: move key to end (most-recently used) to implement LRU-like eviction
            super.delete(key);
            super.set(key, value);
        }
        return value;
    }

    set(key: K, value: V): this {
        if (this.size >= this.maxSize && !this.has(key)) {
            const first = this.keys().next().value as K | undefined;
            if (first !== undefined) this.delete(first);
        }
        return super.set(key, value);
    }
}
