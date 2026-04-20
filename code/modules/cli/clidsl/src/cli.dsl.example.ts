/**
 * Examples of authoring the CLI DSL.
 *
 * This file is intentionally not a test suite and is not imported by production
 * code. Its purpose is to act as executable documentation: every example in
 * this file should compile cleanly, and together they show the intended way to
 * define commands, groups, options, positionals, and typed execute functions.
 *
 * These examples are useful for readers because they show the "happy path"
 * shapes of the DSL without the noise of negative type tests.
 */
import { BasicCliContext, CliModel, defineCommand, group } from "./cli.dsl";
import { safeJson } from "@laoban/safe";

type ExampleContext = BasicCliContext<"cli" | "adapter"> & {
    cwd: string;
};

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

type PublishValues = {
    packageName: string;
    registry: string;
    dryRun: boolean;
    tag: string[];
};

type VersionValues = {
    bump: string;
    yes: boolean;
};

const buildCommand = defineCommand<BuildValues, ExampleContext>()({
    description: "Build one or more targets",
    positionals: {
        target: { type: "string", description: "Build target", required: true },
        files: { type: "string[]", description: "Files to include" }
    },
    options: {
        verbose: { type: "boolean", description: "Enable verbose logging", shortName: "v", defaultValue: false },
        retries: { type: "number", description: "Retry count", shortName: "r", defaultValue: 3 }
    },
    execute: async (values, context) => {
        const target: string = values.target;
        const files: string[] = values.files;
        const verbose: boolean = values.verbose;
        const retries: number = values.retries;
        const cwd: string = context.cwd;
        console.log(safeJson({ values, cwd }));
    }
});

const initCommand = defineCommand<InitValues, ExampleContext>()({
    description: "Initialise a project",
    positionals: {
        name: { type: "string", description: "Project name", required: true },
        template: { type: "string", description: "Template to use" }
    },
    options: {
        force: { type: "boolean", description: "Overwrite existing files", shortName: "f", defaultValue: false }
    },
    execute: async (values, context) => {
        const name: string = values.name;
        const template: string = values.template;
        const force: boolean = values.force;
        const cwd: string = context.cwd;
        console.log(safeJson({ values, cwd }));
    }
});

const publishCommand = defineCommand<PublishValues, ExampleContext>()({
    description: "Publish a package",
    positionals: {
        packageName: { type: "string", description: "Package name", required: true }
    },
    options: {
        registry: { type: "string", description: "Registry URL", defaultValue: "https://registry.npmjs.org" },
        dryRun: { type: "boolean", description: "Do everything except the final publish", shortName: "d", defaultValue: false },
        tag: { type: "string[]", description: "Tags to apply" }
    },
    execute: async (values, context) => {
        const packageName: string = values.packageName;
        const registry: string = values.registry;
        const dryRun: boolean = values.dryRun;
        const tag: string[] = values.tag;
        const cwd: string = context.cwd;
        console.log(safeJson({ values, cwd }));
    }
});

const versionCommand = defineCommand<VersionValues, ExampleContext>()({
    description: "Change package version",
    positionals: {
        bump: { type: "string", description: "Version bump type", required: true }
    },
    options: {
        yes: { type: "boolean", description: "Skip confirmation", shortName: "y", defaultValue: false }
    },
    execute: async (values, context) => {
        const bump: string = values.bump;
        const yes: boolean = values.yes;
        const cwd: string = context.cwd;
        console.log(safeJson({ values, cwd }));
    }
});

export const exampleCli: CliModel<ExampleContext> = group("Laoban example CLI", {
    build: buildCommand,
    project: group("Project commands", {
        init: initCommand
    }),
    package: group("Package commands", {
        publish: publishCommand,
        version: versionCommand
    })
});