export class Strings {
    static maxLength = (ss: string[]) => Math.max(...(ss.map(s => s.length)));
}

export interface StringAndWidth {
    value: string,
    width: number
}