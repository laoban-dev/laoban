/** ref is like ${xxx} and this returns dic[xxx].  */
export function replaceVar(dic: any, ref: string, useUndefinedIfNotPresent: boolean = false): string {
    if (ref === undefined) return undefined
    let i = ref.slice(2, ref.length - 1);
    let parts = i.split('.')
    let notFoundResult = useUndefinedIfNotPresent ? undefined : ref;
    try {
        let result = parts.reduce((acc, part) => acc[part], dic)
        return result !== undefined ? result : notFoundResult
    } catch (e) {return notFoundResult}
}
/** If the string has ${a} in it, then that is replaced by the dic entry */
export function derefence(dic: any, s: string, useUndefinedIfNotPresent: boolean = false) {
    const regex = /(\$\{[^}]*\})/g
    let groups = s.match(regex)
    return groups ? groups.reduce((acc, v) => acc.replace(v, replaceVar(dic, v,useUndefinedIfNotPresent)), s) : s;
}
