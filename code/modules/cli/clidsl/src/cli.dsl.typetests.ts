/**
 * Compile-time tests for the CLI DSL.
 *
 * These tests protect the authoring-time guarantees of the command model.
 * They verify that command definitions, parameter definitions, and builder
 * calls preserve the intended typing rules, and that invalid definitions are
 * rejected by the compiler.
 *
 * Positive cases should compile cleanly.
 * Negative cases use `@ts-expect-error` and are written as invalid assignments,
 * builder calls, or typed usages, since those produce more reliable compiler
 * errors than bare type aliases.
 */
// ----- tiny assertion helpers -----
import {
    BasicCliContext,
    CliCommand,
    CliGroup,
    CliModel,
    CliOptionKey,
    CliOptionParameters,
    CliPositionalKey,
    CliPositionalParameters,
    CliValueTypeName,
    command,
    group, root
} from "./cli.dsl";

type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends
        (<T>() => T extends B ? 1 : 2) ? true : false;

type Expect<T extends true> = T;

// ----- fixtures -----
type BuildValues = {
    target: string;
    files: string[];
    verbose: boolean;
    retries: number;
};

type InitValues = {
    name: string;
    template: string;
    force: boolean;
};

type EmptyValues = {};

type CustomContext = BasicCliContext & {
    cwd: string;
};

// ----- basic type algebra -----
type _type1 = Expect<Equal<CliValueTypeName<string>, "string">>;
type _type2 = Expect<Equal<CliValueTypeName<number>, "number">>;
type _type3 = Expect<Equal<CliValueTypeName<boolean>, "boolean">>;
type _type4 = Expect<Equal<CliValueTypeName<string[]>, "string[]">>;

// ----- positional keys: booleans excluded -----
type _pk1 = Expect<Equal<("target" extends CliPositionalKey<BuildValues> ? true : false), true>>;
type _pk2 = Expect<Equal<("files" extends CliPositionalKey<BuildValues> ? true : false), true>>;
type _pk3 = Expect<Equal<("retries" extends CliPositionalKey<BuildValues> ? true : false), true>>;
type _pk4 = Expect<Equal<("verbose" extends CliPositionalKey<BuildValues> ? true : false), false>>;

// ----- option keys: all keys allowed -----
type _ok1 = Expect<Equal<("target" extends CliOptionKey<BuildValues> ? true : false), true>>;
type _ok2 = Expect<Equal<("files" extends CliOptionKey<BuildValues> ? true : false), true>>;
type _ok3 = Expect<Equal<("retries" extends CliOptionKey<BuildValues> ? true : false), true>>;
type _ok4 = Expect<Equal<("verbose" extends CliOptionKey<BuildValues> ? true : false), true>>;

// ----- positional parameter typing -----
type BuildPositionals = CliPositionalParameters<BuildValues, "target" | "files">;
type _pp1 = Expect<Equal<BuildPositionals["target"]["type"], "string">>;
type _pp2 = Expect<Equal<BuildPositionals["files"]["type"], "string[]">>;

// ----- option parameter typing -----
type BuildOptions = CliOptionParameters<BuildValues, "verbose" | "retries">;
type _op1 = Expect<Equal<BuildOptions["verbose"]["type"], "boolean">>;
type _op2 = Expect<Equal<BuildOptions["retries"]["type"], "number">>;

// ----- positive command authoring -----
const buildCommand: CliCommand<BuildValues, "target" | "files", "verbose" | "retries"> = {
    nodeType: "command",
    description: "Build something",
    positionals: {
        target: {type: "string", description: "Build target", required: true},
        files: {type: "string[]", description: "Files to build"}
    },
    options: {
        verbose: {type: "boolean", description: "Verbose logging", shortName: "v", defaultValue: false},
        retries: {type: "number", description: "Retry count", shortName: "r", defaultValue: 3}
    },
    execute: async (values) => {
        const a: string = values.target;
        const b: string[] = values.files;
        const c: boolean = values.verbose;
        const d: number = values.retries;
        void a;
        void b;
        void c;
        void d;
    }
};

// ----- positive builder authoring -----
const initCommand = command<InitValues, "name" | "template", "force">(
    "Initialise a project",
    {
        name: {type: "string", description: "Project name", required: true},
        template: {type: "string", description: "Template name"}
    },
    {
        force: {type: "boolean", description: "Force overwrite", shortName: "f", defaultValue: false}
    },
    async (values) => {
        const a: string = values.name;
        const b: string = values.template;
        const c: boolean = values.force;
        void a;
        void b;
        void c;
    }
);
// ----- group / model authoring -----
const cli: CliModel = root("laoban", "Root", {
    build: buildCommand,
    project: group("Project commands", {
        init: initCommand
    })
});

const _modelCheck: CliModel = cli;
const _groupCheck: CliGroup = {
    nodeType: 'group',
    description: cli.description,
    children: cli.children
};

// ----- readable assignment checks -----
declare const buildPositionalDefs: CliPositionalParameters<BuildValues, "target" | "files">;
const okPositional1: typeof buildPositionalDefs = {
    target: {type: "string", description: "Build target"},
    files: {type: "string[]", description: "Files"}
};

declare const buildOptionDefs: CliOptionParameters<BuildValues, "verbose" | "retries">;
const okOption1: typeof buildOptionDefs = {
    verbose: {type: "boolean", description: "Verbose", shortName: "v", defaultValue: false},
    retries: {type: "number", description: "Retries", defaultValue: 2}
};

// ----- negatives: boolean cannot be positional -----
// ----- negatives: wrong type metadata on positional -----
const badPositional1: CliPositionalParameters<BuildValues, "target"> = {
    // @ts-expect-error target is string, not number
    target: {type: "number", description: "Wrong"}
};

// ----- negatives: wrong type metadata on option -----
const badOption1: CliOptionParameters<BuildValues, "verbose"> = {
    // @ts-expect-error verbose is boolean, not string
    verbose: {type: "string", description: "Wrong"}
};

// ----- negatives: default value must match option type -----
const badOption2: CliOptionParameters<BuildValues, "retries"> = {
    // @ts-expect-error defaultValue for retries must be a number
    retries: {type: "number", description: "Retries", defaultValue: "3"}
};


// ----- negatives: overlap between positional and option keys disallowed -----
// @ts-expect-error target cannot be both positional and option
const badCommand1: CliCommand<BuildValues, "target", "target"> = {
    nodeType: "command",
    description: "Bad",
    positionals: {
        target: {type: "string", description: "Target"}
    },
    options: {
        target: {type: "string", description: "Target option"}
    },
    execute: async (_values) => {}
};

// ----- negatives: execute values are strongly typed -----
const badCommand2: CliCommand<BuildValues, "target", "verbose"> = {
    nodeType: "command",
    description: "Bad execute typing",
    positionals: {
        target: {type: "string", description: "Target"}
    },
    options: {
        verbose: {type: "boolean", description: "Verbose"}
    },
    execute: async (values) => {
// @ts-expect-error verbose is boolean, not string
        const x: string = values.verbose;
        void x;
    }
};

// ----- negatives: builder rejects bad positional key -----
// @ts-expect-error verbose cannot be a positional key
const badCommand3 = command<BuildValues, "verbose", never>(
    "Bad",
    {
        verbose: {type: "boolean", description: "Nope"}
    },
    {},
    async (_values) => {}
);

// ----- negatives: builder rejects overlap -----
// @ts-expect-error target cannot appear in both positionals and options
const badCommand4 = command<BuildValues, "target", "target">(
    "Bad overlap",
    {
        target: {type: "string", description: "Target"}
    },
    {
        target: {type: "string", description: "Target option"}
    },
    async (_values) => {}
);

// ----- custom context -----
const commandWithContext: CliCommand<BuildValues, "target", "verbose", CustomContext> = {
    nodeType: "command",
    description: "With custom context",
    positionals: {
        target: {type: "string", description: "Target"}
    },
    options: {
        verbose: {type: "boolean", description: "Verbose", defaultValue: false}
    },
    execute: async (_values, context) => {
        const cwd: string = context.cwd;
        void cwd;
    }
};

// ----- empty command is allowed -----
const emptyCommand: CliCommand<EmptyValues> = {
    nodeType: "command",
    description: "Empty",
    positionals: {},
    options: {},
    execute: async (_values) => {}
};