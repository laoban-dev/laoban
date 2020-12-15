export class Debug {
    private options: Set<string>;
    private printer: (...msgs: any) => void;
    constructor(debugString: string | undefined, printer: (msg: any[]) => void) {
        this.options = new Set(debugString ? debugString.split(',') : [])
        this.printer = printer;
    }


    debug(option: string): <To> (msg: () => string, raw: () => Promise<To>, fromFn?: () => any, toFn?: (t: To) => any, errFn?: (e: any) => any) => Promise<To> {
        return <To>(msg, raw, toFn, errFn) =>
            (this.options.has(option)) ?
                raw().then(to => {
                    let t = toFn ? toFn(to) : to
                    this.printer(msg(), t)
                    return to
                }, err => {
                    let e = errFn ? errFn(err) : err
                    if (err) this.printer(msg(), e)
                    throw err
                }) :
                raw()
    }

}

