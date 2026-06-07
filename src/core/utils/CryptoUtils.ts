import { HealerLogger } from './HealerLogger';

/**
 * CryptoUtils
 *
 * SOTA 2026 Web Crypto implementation providing AES-256-GCM encryption
 * for local-first security. Designed for mobile and sync compatibility.
 */
export class CryptoUtils {
    private static readonly ALGORITHM = 'AES-GCM';
    private static readonly KEY_LENGTH = 256;

    /**
     * Derives a stable 256-bit CryptoKey from a master string and salt using PBKDF2.
     *
     * @param master - The master password or secret string.
     * @param salt - The salt used for derivation.
     * @returns A promise resolving to the derived CryptoKey.
     */
    private static async deriveKey(master: string, salt: string): Promise<CryptoKey> {
        const encoder = new TextEncoder();
        const baseKey = await crypto.subtle.importKey('raw', encoder.encode(master), 'PBKDF2', false, ['deriveKey']);

        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: encoder.encode(salt),
                iterations: 600000,
                hash: 'SHA-256',
            },
            baseKey,
            { name: this.ALGORITHM, length: this.KEY_LENGTH },
            false,
            ['encrypt', 'decrypt'],
        );
    }

    /**
     * Generates a new random 256-bit AES-GCM key.
     *
     * @returns A promise resolving to a new extractable CryptoKey.
     */
    public static async generateKey(): Promise<CryptoKey> {
        return await crypto.subtle.generateKey(
            { name: this.ALGORITHM, length: this.KEY_LENGTH },
            true, // extractable
            ['encrypt', 'decrypt'],
        );
    }

    /**
     * Exports a CryptoKey to a JWK (JSON Web Key) string representation.
     *
     * @param key - The CryptoKey to export.
     * @returns A promise resolving to the JWK string.
     */
    public static async exportKey(key: CryptoKey): Promise<string> {
        const jwk = await crypto.subtle.exportKey('jwk', key);
        return JSON.stringify(jwk);
    }

    /**
     * Imports a CryptoKey from its JWK string representation.
     *
     * @param jwk - The JWK string.
     * @returns A promise resolving to the imported CryptoKey.
     */
    public static async importKey(jwk: string): Promise<CryptoKey> {
        const jwkObj = JSON.parse(jwk) as JsonWebKey;
        return await crypto.subtle.importKey('jwk', jwkObj, { name: this.ALGORITHM, length: this.KEY_LENGTH }, true, [
            'encrypt',
            'decrypt',
        ]);
    }

    /**
     * Encrypts a string using AES-256-GCM.
     * Uses a fresh 12-byte IV for every encryption.
     *
     * @param text - The plaintext to encrypt.
     * @param keyOrMaster - Either an existing CryptoKey or a master string to derive a key from.
     * @param salt - The salt to use if keyOrMaster is a string. Optional if keyOrMaster is a CryptoKey.
     * @returns A promise resolving to a base64 string containing iv + ciphertext.
     * @throws Error if encryption fails.
     */
    public static async encrypt(text: string, keyOrMaster: string | CryptoKey, salt?: string): Promise<string> {
        try {
            let key: CryptoKey;
            if (keyOrMaster instanceof CryptoKey) {
                key = keyOrMaster;
            } else {
                if (!salt) throw new Error('SALT_REQUIRED_FOR_STRING_KEY');
                key = await this.deriveKey(keyOrMaster, salt);
            }
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encoder = new TextEncoder();

            const ciphertext = await crypto.subtle.encrypt({ name: this.ALGORITHM, iv }, key, encoder.encode(text));

            // Combine IV and ciphertext for storage
            const combined = new Uint8Array(iv.length + ciphertext.byteLength);
            combined.set(iv);
            combined.set(new Uint8Array(ciphertext), iv.length);

            // Robust Base64 for SOTA 2026 (prevents call stack size exceeded on large buffers)
            return this.uint8ToBase64(combined);
        } catch (e) {
            HealerLogger.error('Encryption failed', e);
            throw new Error('FAILED_ENCRYPTION');
        }
    }

    /**
     * Decrypts a base64 combined string (iv + ciphertext).
     *
     * @param combinedBase64 - The encrypted base64 string.
     * @param keyOrMaster - Either an existing CryptoKey or a master string to derive a key from.
     * @param salt - The salt to use if keyOrMaster is a string. Optional if keyOrMaster is a CryptoKey.
     * @returns A promise resolving to the decrypted plaintext string or null if decryption fails.
     */
    public static async decrypt(
        combinedBase64: string,
        keyOrMaster: string | CryptoKey,
        salt?: string,
    ): Promise<string | null> {
        try {
            const combined = this.base64ToUint8(combinedBase64);
            const iv = combined.slice(0, 12);
            const ciphertext = combined.slice(12);

            let key: CryptoKey;
            if (keyOrMaster instanceof CryptoKey) {
                key = keyOrMaster;
            } else {
                if (!salt) return null;
                key = await this.deriveKey(keyOrMaster, salt);
            }
            const decrypted = await crypto.subtle.decrypt({ name: this.ALGORITHM, iv }, key, ciphertext);

            return new TextDecoder().decode(decrypted);
        } catch (e) {
            HealerLogger.error('Decryption failed', e);
            return null;
        }
    }

    /**
     * Encodes a Uint8Array to a base64 string using chunking to prevent stack overflow.
     *
     * @param u8 - The byte array to encode.
     * @returns The base64 encoded string.
     */
    private static uint8ToBase64(u8: Uint8Array): string {
        const CHUNK_SIZE = 0x8000; // 32KB
        let s = '';
        for (let i = 0; i < u8.length; i += CHUNK_SIZE) {
            s += String.fromCharCode(...u8.subarray(i, i + CHUNK_SIZE));
        }
        return btoa(s);
    }

    /**
     * Decodes a base64 string to a Uint8Array.
     *
     * @param b64 - The base64 string to decode.
     * @returns The resulting byte array.
     */
    private static base64ToUint8(b64: string): Uint8Array {
        const binary = atob(b64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
}
