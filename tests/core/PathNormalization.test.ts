import { describe, it, expect } from 'vitest';
import { join, normalize, basename, dirname } from 'pathe';

describe('Path Normalization (pathe)', () => {
    it('should normalize Windows paths to POSIX style', () => {
        const windowsPath = 'folder\\subfolder\\file.md';
        expect(normalize(windowsPath)).toBe('folder/subfolder/file.md');
    });

    it('should correctly join paths regardless of input separator', () => {
        const p1 = 'folder\\subfolder';
        const p2 = 'file.md';
        expect(join(p1, p2)).toBe('folder/subfolder/file.md');
    });

    it('should correctly extract basename from Windows paths', () => {
        const windowsPath = 'C:\\Users\\User\\Documents\\Vault\\Note.md';
        expect(basename(windowsPath)).toBe('Note.md');
        expect(basename(windowsPath, '.md')).toBe('Note');
    });

    it('should correctly extract dirname from Windows paths', () => {
        const windowsPath = 'folder\\subfolder\\file.md';
        expect(dirname(windowsPath)).toBe('folder/subfolder');
    });

    it('should handle mixed separators', () => {
        const mixedPath = 'folder/subfolder\\file.md';
        expect(normalize(mixedPath)).toBe('folder/subfolder/file.md');
    });

    it('should handle multiple consecutive separators', () => {
        const doublePath = 'folder//subfolder\\\\file.md';
        expect(normalize(doublePath)).toBe('folder/subfolder/file.md');
    });
});
