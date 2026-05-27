import { describe, it, expect } from 'vitest';
import { CryptoUtils } from '../../../src/core/utils/CryptoUtils';

describe('CryptoUtils', () => {
    it('should generate a valid extractable CryptoKey', async () => {
        const key = await CryptoUtils.generateKey();
        expect(key).toBeDefined();
        expect(key.type).toBe('secret');
        expect(key.extractable).toBe(true);
        expect(key.algorithm.name).toBe('AES-GCM');
    });

    it('should export and import a key via JWK correctly', async () => {
        const originalKey = await CryptoUtils.generateKey();
        const jwk = await CryptoUtils.exportKey(originalKey);
        expect(typeof jwk).toBe('string');
        expect(jwk).toContain('"kty":"oct"');

        const importedKey = await CryptoUtils.importKey(jwk);
        expect(importedKey).toBeDefined();
        expect(importedKey.type).toBe('secret');
        expect(importedKey.algorithm.name).toBe('AES-GCM');
    });

    it('should encrypt and decrypt using a CryptoKey correctly', async () => {
        const key = await CryptoUtils.generateKey();
        const plaintext = 'Hello, SOTA 2026!';
        const salt = 'test-salt';

        const encrypted = await CryptoUtils.encrypt(plaintext, key, salt);
        expect(encrypted).toBeDefined();
        expect(typeof encrypted).toBe('string');
        expect(encrypted).not.toBe(plaintext);

        const decrypted = await CryptoUtils.decrypt(encrypted, key, salt);
        expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt using a master string correctly (PBKDF2)', async () => {
        const master = 'super-secret-password';
        const plaintext = 'Sensitive Data';
        const salt = 'stable-app-id';

        const encrypted = await CryptoUtils.encrypt(plaintext, master, salt);
        const decrypted = await CryptoUtils.decrypt(encrypted, master, salt);

        expect(decrypted).toBe(plaintext);
    });

    it('should fail to decrypt with the wrong master string', async () => {
        const master = 'correct-password';
        const wrongMaster = 'wrong-password';
        const plaintext = 'Sensitive Data';
        const salt = 'stable-app-id';

        const encrypted = await CryptoUtils.encrypt(plaintext, master, salt);
        const decrypted = await CryptoUtils.decrypt(encrypted, wrongMaster, salt);

        expect(decrypted).toBeNull();
    });

    it('should fail to decrypt with the wrong salt', async () => {
        const master = 'password';
        const plaintext = 'Data';
        const salt = 'salt1';
        const wrongSalt = 'salt2';

        const encrypted = await CryptoUtils.encrypt(plaintext, master, salt);
        const decrypted = await CryptoUtils.decrypt(encrypted, master, wrongSalt);

        expect(decrypted).toBeNull();
    });

    it('should handle large payloads without stack overflow (chunking check)', async () => {
        const key = await CryptoUtils.generateKey();
        // 1MB of data to test chunking in uint8ToBase64
        const largePlaintext = 'A'.repeat(1024 * 1024);
        const salt = 'test-salt';

        const encrypted = await CryptoUtils.encrypt(largePlaintext, key, salt);
        const decrypted = await CryptoUtils.decrypt(encrypted, key, salt);

        expect(decrypted).toBe(largePlaintext);
    });
});
