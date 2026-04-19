import {
    mustBeArrayOf,
    mustBeArrayOfIfPresent,
    mustBeNameAnd,
    mustBeNameAndIfPresent,
    mustBeObjectWithFields,
    mustBeString,
    mustBeStringIfPresent,
    type Validator,
} from "@laoban/validation";
import {
    validateLaobanScript,
    validateRawLaobanScript,
} from "@laoban/scripts";
import type { LaobanConfig, LaobanConfigFile } from "./laoban.config";

export const validateConfigFileContents: Validator<LaobanConfigFile> =
    mustBeObjectWithFields<LaobanConfigFile>(
        {
            packageManager: mustBeStringIfPresent,
            versionFile: mustBeStringIfPresent,
            parents: mustBeArrayOfIfPresent(mustBeString),
            properties: mustBeNameAndIfPresent(mustBeString),
            templates: mustBeNameAndIfPresent(mustBeString),
            defaultEnv: mustBeNameAndIfPresent(mustBeString),
            scripts: mustBeNameAndIfPresent(validateRawLaobanScript),
            skipDirectories: mustBeArrayOfIfPresent(mustBeString),
        },
        true
    );

export const validateLaobanConfig: Validator<LaobanConfig> =
    mustBeObjectWithFields<LaobanConfig>(
        {
            packageManager: mustBeString,
            versionFile: mustBeString,
            parents: mustBeArrayOf(mustBeString),
            properties: mustBeNameAnd(mustBeString, true),
            templates: mustBeNameAnd(mustBeString, true),
            defaultEnv: mustBeNameAnd(mustBeString, true),
            scripts: mustBeNameAnd(validateLaobanScript, true),
            skipDirectories: mustBeArrayOf(mustBeString),
        },
        true
    );