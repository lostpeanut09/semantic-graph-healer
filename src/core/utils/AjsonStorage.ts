import type { DataAdapter } from 'obsidian';

/**
 * AjsonStorage: High-performance utility for JSON-per-line (AJSON) persistence.
 * Optimized for large indices (entities, relationships, community reports).
 *
 * Pattern: Append-only for high-frequency writes (AI-06).
 * Memory Safety: readAll parses line-by-line to handle large files.
 */
export class AjsonStorage {
    constructor(private adapter: DataAdapter) {}

    /**
     * Appends a single JSON object as a new line to the file.
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
     * Reads all lines and parses them into an array of objects.
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
     * Upserts an object by a specific key.
     * Rewrites the file with updated data.
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
