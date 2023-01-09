//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
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

export const NullDebugCommands: DebugCommands = ({
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

