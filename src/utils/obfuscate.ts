const OBFUSCATE_KEY = 0x5A;

export function obfuscate(str: string): string {
    if (!str) return '';
    const xored = str.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ OBFUSCATE_KEY)).join('');
    return btoa(unescape(encodeURIComponent(xored)));
}

export function deobfuscate(encoded: string): string {
    if (!encoded) return '';
    try {
        const xored = decodeURIComponent(escape(atob(encoded)));
        return xored.split('').map(c => String.fromCharCode(c.charCodeAt(0) ^ OBFUSCATE_KEY)).join('');
    } catch {
        return encoded;
    }
}
