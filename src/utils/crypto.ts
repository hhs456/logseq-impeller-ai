// src/utils/crypto.ts
const SALT = 'impeller-ai-salt-v1';
const ITERATIONS = 100000;
export const AES_PREFIX = 'AES1:';

async function deriveKey(): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode('impeller-master-key'),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: enc.encode(SALT), iterations: ITERATIONS, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function encryptApiKey(plaintext: string): Promise<string> {
    if (!plaintext) return '';
    const key = await deriveKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        enc.encode(plaintext)
    );
    const combined = new Uint8Array([...iv, ...new Uint8Array(ciphertext)]);
    return AES_PREFIX + btoa(String.fromCharCode(...combined));
}

export async function decryptApiKey(stored: string): Promise<string> {
    if (!stored) return '';
    if (stored.startsWith(AES_PREFIX)) {
        try {
            const key = await deriveKey();
            const combined = Uint8Array.from(
                atob(stored.slice(AES_PREFIX.length)),
                c => c.charCodeAt(0)
            );
            const iv = combined.slice(0, 12);
            const ciphertext = combined.slice(12);
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                ciphertext
            );
            return new TextDecoder().decode(decrypted);
        } catch {
            return '';
        }
    }
    try {
        const OBFUSCATE_KEY = 0x5A;
        return atob(stored).split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ OBFUSCATE_KEY)).join('');
    } catch {
        return stored;
    }
}
