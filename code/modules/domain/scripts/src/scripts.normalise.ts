import {
    LaobanCommand,
    LaobanScript,
    LaobanScripts,
    RawLaobanCommand,
    RawLaobanScript,
    RawLaobanScripts,
} from "./scripts.domain";

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
        guard: command.guard,
        directory: command.directory,
        status: command.status ?? false,
    };
}

export function normaliseRawLaobanScript(script: RawLaobanScript): LaobanScript {
    return {
        description: script.description,
        commands: script.commands.map(normaliseRawLaobanCommand),
        guard: script.guard,
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