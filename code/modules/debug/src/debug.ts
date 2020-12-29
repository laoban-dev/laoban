type DebugFactory = (options: Set<string>, printer: (msgs: any[]) => any) => Debug
export type Debug = (option: string) => DebugCommands

export let debug: DebugFactory = (options, printer) => option =>
    options.has(option) ? new DebugCommandImpl(option, printer) : NullDebugCommands

export type DebugPrinter = (msgs: any[]) => any
export function addDebug(debugString: string | undefined, printer: DebugPrinter): <X>(x: X) => X & { debug: Debug } {
    return <X>(x: X) => ({...x, debug: debug(new Set(debugString ? debugString.split(',') : []), printer)})
}

export interface DebugCommands {
    message(msg: () => any[])
    k<To>(msg: () => string, raw: () => Promise<To>): Promise<To>
}

let NullDebugCommands: DebugCommands = ({
    k: <To>(msg: () => string, raw: () => Promise<To>) => raw(),
    message: (msg: () => any[]) => { }
})

class DebugCommandImpl implements DebugCommands {
    private printer: (msgs: any[]) => void;
    private option: string;
    constructor(option: string, printer: (msgs: any[]) => void) {
        this.option = option;
        this.printer = printer
    }
    k<To>(msg: () => string, raw: () => Promise<To>): Promise<To> {
        return raw().then(to => {
                this.printer([this.option, msg()]);
                return to
            },
            err => {
                this.printer([this.option, 'error executing ', msg(), err])
                throw err
            })
    }
    message = (msg: () => any[]) => this.printer(msg());
}

