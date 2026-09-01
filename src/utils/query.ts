export function escapeDsString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
