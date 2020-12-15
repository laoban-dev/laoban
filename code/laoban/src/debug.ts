export class Debug {
    private options: Set<string>;
    private printer: (...msgs: any) => void;
    constructor(debugString: string | undefined, printer: (msg: any[]) => void) {
        this.options = new Set(debugString ? debugString.split(',') : [])
        this.printer = printer;
    }

    debug(option: string): <To> (msg: () => string, raw: () => Promise<To>) => Promise<To> {
        return <To>(msg, raw) =>
            (this.options.has(option)) ?
                raw().then(to => {
                    this.printer(msg())
                    return to
                }, err => {
                    this.printer('error executing ' + msg(), err)
                    throw err
                }) :
                raw()
    }

}

