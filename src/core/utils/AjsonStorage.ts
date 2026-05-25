import type { DataAdapter } from 'obsidian';

/**
 * AjsonStorage
 * 
 * High-performance utility for JSON-per-line (AJSON) persistence.
 * Optimized for large indices (entities, relationships, community reports).
 * Uses an append-only pattern for high-frequency writes and line-by-line 
 * parsing for memory safety.
 */
export class AjsonStorage {
    /**
     * Creates an instance of AjsonStorage.
     * @param adapter - The Obsidian DataAdapter used for file operations.
     */
    constructor(private adapter: DataAdapter) {}

    /**
     * Appends a single JSON object as a new line to the file.
     * If the file doesn't exist, it will be created.
     * 
     * @param filePath - The path to the AJSON file.
     * @param data - The object to serialize and append.
     * @returns A promise that resolves when the write is complete.
     */
    async appendLine(filePath: string, data: object): Promise<void> {
        const line = JSON.stringify(data) + '\n';

        if (await this.adapter.exists(filePath)) {
            await this.adapter.append(filePath, line);
        } else {
            await this.adapter.write(filePath, line);
        }
    }

    /**
     * Reads all lines from an AJSON file and parses them into an array of objects.
     * Handles large files by reading the entire content and splitting by line.
     * 
     * @template T - The expected type of the parsed objects.
     * @param filePath - The path to the AJSON file.
     * @returns A promise resolving to an array of parsed objects.
     */
    async readAll<T = Record<string, unknown>>(filePath: string): Promise<T[]> {
        if (!(await this.adapter.exists(filePath))) {
            return [];
        }
        const content = await this.adapter.read(filePath);
        if (!content) return [];

        const lines = content.split('\n');
        const result: T[] = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed) {
                try {
                    result.push(JSON.parse(trimmed) as T);
                } catch {
                    // Skip malformed lines
                }
            }
        }
        return result;
    }

    /**
     * Upserts an object into an AJSON file based on a specific key.
     * This operation involves reading the whole file, updating the matching item, 
     * and rewriting the entire file. Use sparingly for large files.
     * 
     * @param filePath - The path to the AJSON file.
     * @param key - The property name used as a unique identifier for upserting.
     * @param data - The data object containing the key and updated values.
     * @returns A promise that resolves when the file has been updated.
     */
    async upsert(filePath: string, key: string, data: Record<string, unknown>): Promise<void> {
        const items = await this.readAll<Record<string, unknown>>(filePath);
        const keyValue = data[key];

        let found = false;
        const updatedItems = items.map((item) => {
            if (item[key] === keyValue) {
                found = true;
                return { ...item, ...data };
            }
            return item;
        });

        if (!found) {
            updatedItems.push(data);
        }

        const newContent = updatedItems.map((item) => JSON.stringify(item)).join('\n') + '\n';
        await this.adapter.write(filePath, newContent);
    }
}
