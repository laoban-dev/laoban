export class Strings {
    static maxLength = (ss: string[]) => Math.max(...(ss.map(s => s.length)));
}

export interface StringAndWidth {
    value: string,
    width: number
}

export class Maps {
    static add<K, V>(map: Map<K, V[]>, k: K, v: V) {
        let existing = map.get(k)
        if (existing) {
            existing.push(v)
        } else {
            map.set(k, [v])
        }
    }
    static addAll<K, V>(map: Map<K, V[]>, k: K, vs: V[]) {
        let existing = map.get(k)
        if (existing) {
            vs.forEach(v => existing.push(v))
        } else {
            map.set(k, [...vs])
        }
    }
}