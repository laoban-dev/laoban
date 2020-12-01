export class Strings {
    static maxLength = (ss: string[]) => Math.max(...(ss.map(s => s.length)));
}