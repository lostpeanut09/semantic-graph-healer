import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AjsonStorage } from '../../../src/core/utils/AjsonStorage';

describe('AjsonStorage', () => {
    let storage: AjsonStorage;
    let mockAdapter: any;

    beforeEach(() => {
        mockAdapter = {
            exists: vi.fn(),
            read: vi.fn(),
            write: vi.fn(),
            append: vi.fn(),
        };
        storage = new AjsonStorage(mockAdapter);
    });

    it('should append a line to an existing file', async () => {
        mockAdapter.exists.mockResolvedValue(true);
        const data = { id: 1, name: 'test' };

        await storage.appendLine('test.ajson', data);

        expect(mockAdapter.append).toHaveBeenCalledWith('test.ajson', JSON.stringify(data) + '\n');
    });

    it('should create a file and write the first line if it does not exist', async () => {
        mockAdapter.exists.mockResolvedValue(false);
        const data = { id: 1, name: 'test' };

        await storage.appendLine('test.ajson', data);

        expect(mockAdapter.write).toHaveBeenCalledWith('test.ajson', JSON.stringify(data) + '\n');
    });

    it('should read all lines from a file', async () => {
        mockAdapter.exists.mockResolvedValue(true);
        const content = JSON.stringify({ id: 1 }) + '\n' + JSON.stringify({ id: 2 }) + '\n';
        mockAdapter.read.mockResolvedValue(content);

        const result = await storage.readAll('test.ajson');

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ id: 1 });
        expect(result[1]).toEqual({ id: 2 });
    });

    it('should return empty array if file does not exist', async () => {
        mockAdapter.exists.mockResolvedValue(false);
        const result = await storage.readAll('missing.ajson');
        expect(result).toEqual([]);
    });

    it('should upsert an item in the file', async () => {
        mockAdapter.exists.mockResolvedValue(true);
        const content = JSON.stringify({ id: 1, val: 'old' }) + '\n' + JSON.stringify({ id: 2, val: 'two' }) + '\n';
        mockAdapter.read.mockResolvedValue(content);

        await storage.upsert('test.ajson', 'id', { id: 1, val: 'new' });

        const expected = JSON.stringify({ id: 1, val: 'new' }) + '\n' + JSON.stringify({ id: 2, val: 'two' }) + '\n';
        expect(mockAdapter.write).toHaveBeenCalledWith('test.ajson', expected);
    });

    it('should append on upsert if key not found', async () => {
        mockAdapter.exists.mockResolvedValue(true);
        const content = JSON.stringify({ id: 1, val: 'one' }) + '\n';
        mockAdapter.read.mockResolvedValue(content);

        await storage.upsert('test.ajson', 'id', { id: 2, val: 'two' });

        const expected = JSON.stringify({ id: 1, val: 'one' }) + '\n' + JSON.stringify({ id: 2, val: 'two' }) + '\n';
        expect(mockAdapter.write).toHaveBeenCalledWith('test.ajson', expected);
    });

    it('should handle malformed lines gracefully in readAll', async () => {
        mockAdapter.exists.mockResolvedValue(true);
        const content = '{"id": 1}\n{invalid}\n{"id": 3}\n';
        mockAdapter.read.mockResolvedValue(content);

        const result = await storage.readAll('malformed.ajson');

        expect(result).toHaveLength(2);
        expect(result[0]).toEqual({ id: 1 });
        expect(result[1]).toEqual({ id: 3 });
    });
});
