/**
 * CryptoUtils: AES-256-GCM encryption for local-first security.
 * SOTA 2026 Web Crypto Implementation.
 * Ensuring mobile & sync compatibility by using app.appId as salt.
 */
export class CryptoUtils {
    private static readonly ALGORITHM = 'AES-GCM';
    private static readonly KEY_LENGTH = 256;

    /**
     * Derives a stable 256-bit key from a salt and a master string.
     */
    private static async deriveKey(master: string, salt: string): Promise<CryptoKey> {
        const encoder = new TextEncoder();
        const baseKey = await crypto.subtle.importKey('raw', encoder.encode(master), 'PBKDF2', false, ['deriveKey']);

        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: encoder.encode(salt),
                iterations: 100000,
                hash: 'SHA-256',
            },
            baseKey,
            { name: this.ALGORITHM, length: this.KEY_LENGTH },
            false,
            ['encrypt', 'decrypt'],
        );
    }

    /**
     * Encrypts a string using AES-256-GCM.
     * Returns: base64(iv + ciphertext)
     */
    public static async encrypt(text: string, master: string, salt: string): Promise<string> {
        try {
            const key = await this.deriveKey(master, salt);
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encoder = new TextEncoder();

            const ciphertext = await crypto.subtle.encrypt({ name: this.ALGORITHM, iv }, key, encoder.encode(text));

            // Combine IV and ciphertext for storage
            const combined = new Uint8Array(iv.length + ciphertext.byteLength);
            combined.set(iv);
            combined.set(new Uint8Array(ciphertext), iv.length);

            // btoa for storage
            return btoa(String.fromCharCode(...combined));
        } catch (e) {
            console.error('Encryption failed', e);
            throw new Error('FAILED_ENCRYPTION');
        }
    }

    /**
     * Decrypts a base64 combined string.
     */
    public static async decrypt(combinedBase64: string, master: string, salt: string): Promise<string | null> {
        try {
            const combined = new Uint8Array(
                atob(combinedBase64)
                    .split('')
                    .map((c) => c.charCodeAt(0)),
            );
            const iv = combined.slice(0, 12);
            const ciphertext = combined.slice(12);

            const key = await this.deriveKey(master, salt);
            const decrypted = await crypto.subtle.decrypt({ name: this.ALGORITHM, iv }, key, ciphertext);

            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.error('Decryption failed', e);
            return null;
        }
    }
}
