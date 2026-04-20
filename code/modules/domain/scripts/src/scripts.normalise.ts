import {
    LaobanCommand,
    LaobanScript,
    LaobanScripts,
    RawLaobanCommand,
    RawLaobanScript,
    RawLaobanScripts,
    RawScriptGuard,
    ScriptGuard,
} from "./scripts.domain";

export function normaliseRawScriptGuard(guard: RawScriptGuard | undefined): ScriptGuard | undefined {
    if (guard === undefined) return undefined;
    if (typeof guard === "boolean") return { value: guard };
    if (typeof guard === "string") return { value: guard };
    return {
        value: guard.value,
        default: guard.default,
    };
}

export function normaliseRawLaobanCommand(command: RawLaobanCommand): LaobanCommand {
    if (typeof command === "string") {
        return {
            command,
            status: false,
        };
    }

    return {
        name: command.name,
        command: command.command,
        guard: normaliseRawScriptGuard(command.guard),
        directory: command.directory,
        status: command.status ?? false,
    };
}

export function normaliseRawLaobanScript(script: RawLaobanScript): LaobanScript {
    return {
        description: script.description,
        commands: script.commands.map(normaliseRawLaobanCommand),
        guard: normaliseRawScriptGuard(script.guard),
        osGuard: script.osGuard,
        inLinksOrder: script.inLinksOrder ?? false,
        showShell: script.showShell ?? false,
        commandArgs: script.commandArgs ?? {},
        env: script.env ?? {},
    };
}

export function normaliseRawLaobanScripts(scripts: RawLaobanScripts): LaobanScripts {
    const result: LaobanScripts = {};
    for (const [name, script] of Object.entries(scripts)) {
        result[name] = normaliseRawLaobanScript(script);
    }
    return result;
}