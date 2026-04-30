import {ScriptFilterValues} from "./filter.packages";
import {LaobanPackageCliContext} from "@laoban/package_cli";
import {LaobanScript, ScriptName} from "@laoban/scripts";
import {ErrorsOr} from "@laoban/errors";

export interface ScriptCommandValues extends ScriptFilterValues {
    // one: boolean; from ScriptFilterValues
    // all: boolean;
    // packages: string;
    dryrun: boolean;
    shellDebug: boolean;
    quiet: boolean;
    variables: boolean;
    generationPlan: boolean;
    throttle: string;
    sessionId: string;
    ignoreGuards: boolean;
}

export type HandleLaobanScriptFn<TContext extends LaobanPackageCliContext> =
    (scriptName: ScriptName, script: LaobanScript, values: ScriptCommandValues, context: TContext) => Promise<ErrorsOr<any>>;

export type ReferenceFileName = string
export type Purpose = 'log' | 'session'