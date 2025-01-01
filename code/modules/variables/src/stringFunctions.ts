import {NameAnd} from "@laoban/utils";

export function getLastSegment(path: string): string {
    if (!path) return '';

    const segments = path.split('/').filter(Boolean);  // Remove empty segments
    return segments.length ? segments[segments.length - 1] : '';
}

export const stringFunctions: NameAnd<(s: string, text: string) => string> = {
    urlEncode: s => encodeURIComponent(s),
    lastSegment: s => getLastSegment(s),
    forwardSlashToDot: s => s.replace(/\//g, '.'),
    toLowerCase: s => s.toLowerCase(),
    toUpperCase: s => s.toUpperCase(),
    toTitleCase: s => s.replace(/\w\S*/g, function (txt) {return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();}),
    toFirstUpper: s => s === '' ? s : s.charAt(0).toUpperCase() + s.slice(1),
    toSnakeCase: s => s.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase(),
    toPackage: s => s.replace(/\./g, '/'),
    "default": (s, text) => s !== undefined ? s : text,
}