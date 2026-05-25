// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CryptoUtils } from '../../../src/core/utils/CryptoUtils';

describe('CryptoUtils', () => {
    const salt = 'test-salt';
    const text = 'Hello, World!';
    const masterKey = 'test-master-key';

    it('encrypts and decrypts using a string master key', async () => {
        const encrypted = await CryptoUtils.encrypt(text, masterKey, salt);
        expect(encrypted).toBeDefined();
        expect(encrypted).not.toBe(text);

        const decrypted = await CryptoUtils.decrypt(encrypted, masterKey, salt);
        expect(decrypted).toBe(text);
    });

    it('encrypts and decrypts using a CryptoKey object', async () => {
        const key = await CryptoUtils.generateKey();
        expect(key).toBeInstanceOf(CryptoKey);

        const encrypted = await CryptoUtils.encrypt(text, key, salt);
        expect(encrypted).toBeDefined();
        expect(encrypted).not.toBe(text);

        const decrypted = await CryptoUtils.decrypt(encrypted, key, salt);
        expect(decrypted).toBe(text);
    });

    it('can export and import a key', async () => {
        const key = await CryptoUtils.generateKey();
        const jwk = await CryptoUtils.exportKey(key);
        expect(typeof jwk).toBe('string');
        expect(jwk).toContain('"kty":"oct"');

        const importedKey = await CryptoUtils.importKey(jwk);
        expect(importedKey).toBeInstanceOf(CryptoKey);

        const text2 = 'Secret Message';
        const encrypted = await CryptoUtils.encrypt(text2, importedKey, salt);
        const decrypted = await CryptoUtils.decrypt(encrypted, key, salt); // Use original key to decrypt
        expect(decrypted).toBe(text2);
    });
});
