import { describe, it, expect } from 'vitest';
import {
    isRecord,
    normalizeDataviewFieldName,
    isDatacoreLink,
    unwrapInternalPluginInstance,
    isPathBookmarked,
} from '../../../src/core/utils/DatacoreUtils';

describe('DatacoreUtils', () => {
    describe('isRecord', () => {
        it('returns true for objects', () => {
            expect(isRecord({})).toBe(true);
            expect(isRecord({ a: 1 })).toBe(true);
        });

        it('returns false for null', () => {
            expect(isRecord(null)).toBe(false);
        });

        it('returns false for arrays', () => {
            expect(isRecord([])).toBe(false);
            expect(isRecord([1, 2, 3])).toBe(false);
        });

        it('returns false for primitives', () => {
            expect(isRecord('string')).toBe(false);
            expect(isRecord(123)).toBe(false);
            expect(isRecord(true)).toBe(false);
            expect(isRecord(undefined)).toBe(false);
        });
    });

    describe('normalizeDataviewFieldName', () => {
        it('lowercases the string', () => {
            expect(normalizeDataviewFieldName('MyField')).toBe('myfield');
        });

        it('replaces spaces with hyphens', () => {
            expect(normalizeDataviewFieldName('my field name')).toBe('my-field-name');
        });

        it('removes special characters', () => {
            expect(normalizeDataviewFieldName('field!@#$%^&*()_+name')).toBe('fieldname');
        });

        it('normalizes NFKC characters', () => {
            expect(normalizeDataviewFieldName('\u2160')).toBe('i'); // Roman numeral I normalizes to 'I' then lowercase to 'i'
        });

        it('removes leading and trailing hyphens', () => {
            expect(normalizeDataviewFieldName('-my-field-')).toBe('my-field');
        });

        it('collapses multiple hyphens into a single hyphen', () => {
            expect(normalizeDataviewFieldName('my---field')).toBe('my-field');
        });

        it('trims whitespace before processing', () => {
            expect(normalizeDataviewFieldName('  my field  ')).toBe('my-field');
        });
    });

    describe('isDatacoreLink', () => {
        it('returns true for valid DatacoreLink objects', () => {
            expect(isDatacoreLink({ path: 'my/path.md' })).toBe(true);
            expect(isDatacoreLink({ path: 'my/path.md', display: 'My Path' })).toBe(true);
        });

        it('returns false for objects missing path', () => {
            expect(isDatacoreLink({})).toBe(false);
            expect(isDatacoreLink({ display: 'My Path' })).toBe(false);
        });

        it('returns false when path is not a string', () => {
            expect(isDatacoreLink({ path: 123 })).toBe(false);
            expect(isDatacoreLink({ path: null })).toBe(false);
        });

        it('returns false for primitives and null', () => {
            expect(isDatacoreLink(null)).toBe(false);
            expect(isDatacoreLink(undefined)).toBe(false);
            expect(isDatacoreLink('path')).toBe(false);
            expect(isDatacoreLink(123)).toBe(false);
        });

        it('returns false for arrays', () => {
            expect(isDatacoreLink([{ path: 'my/path.md' }])).toBe(false);
        });
    });

    describe('unwrapInternalPluginInstance', () => {
        it('returns the instance property if it exists', () => {
            const instanceObj = { key: 'value' };
            expect(unwrapInternalPluginInstance({ instance: instanceObj })).toBe(instanceObj);
        });

        it('returns the object itself if instance property is missing', () => {
            const obj = { key: 'value' };
            expect(unwrapInternalPluginInstance(obj)).toBe(obj);
        });

        it('returns null for non-record values', () => {
            expect(unwrapInternalPluginInstance(null)).toBeNull();
            expect(unwrapInternalPluginInstance(undefined)).toBeNull();
            expect(unwrapInternalPluginInstance('string')).toBeNull();
            expect(unwrapInternalPluginInstance(123)).toBeNull();
            expect(unwrapInternalPluginInstance([])).toBeNull();
        });
    });

    describe('isPathBookmarked', () => {
        it('returns true if the path is in a flat list', () => {
            const items = [
                { type: 'file', path: 'other/path.md' },
                { type: 'file', path: 'target/path.md' },
            ];
            expect(isPathBookmarked(items, 'target/path.md')).toBe(true);
        });

        it('returns false if the path is not in the list', () => {
            const items = [
                { type: 'file', path: 'other/path.md' },
                { type: 'file', path: 'another/path.md' },
            ];
            expect(isPathBookmarked(items, 'target/path.md')).toBe(false);
        });

        it('returns true if the path is nested in a group or folder', () => {
            const items = [
                { type: 'file', path: 'other/path.md' },
                {
                    type: 'group',
                    items: [
                        { type: 'file', path: 'nested/other.md' },
                        {
                            type: 'folder',
                            items: [
                                { type: 'file', path: 'target/path.md' }
                            ]
                        }
                    ]
                }
            ];
            expect(isPathBookmarked(items, 'target/path.md')).toBe(true);
        });

        it('ignores invalid items and continues searching', () => {
            const items = [
                null,
                123,
                'string',
                { type: 'file' }, // missing path
                { type: 'group', items: null }, // invalid items array
                { type: 'file', path: 'target/path.md' }
            ];
            expect(isPathBookmarked(items, 'target/path.md')).toBe(true);
        });

        it('returns false for empty lists', () => {
            expect(isPathBookmarked([], 'target/path.md')).toBe(false);
        });
    });
});
