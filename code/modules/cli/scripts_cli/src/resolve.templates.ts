import { ErrorsOr, flatmapArrayOfArrayOfErrorsOr, mapErrorsOr } from "@laoban/errors";
import { Observability } from "@laoban/observability";
import { LoadedLaobanProject } from "@laoban/package_details";
import { NameAnd } from "@laoban/records";
import { renderTemplate, TemplateIssue } from "@laoban/template";
import {ScriptExecutionItem} from "@laoban/script_plan";

export type ScriptExecutionItemTemplateDictionaryFn =
    (item: ScriptExecutionItem, loadedProject: LoadedLaobanProject) => NameAnd<any>;

export const makeScriptExecutionItemTemplateDictionary: ScriptExecutionItemTemplateDictionaryFn = (
    item: ScriptExecutionItem,
    loadedProject: LoadedLaobanProject
): NameAnd<any> => {
    const packageDetails = item.pkg?.contents;
    const config: any = {...loadedProject.loadedLaobanConfig.config};
    delete config.scripts
    delete config.parents
    delete config.templates
    delete config.defaultEnv
    return {
        ...config,
        packageDetails
    };
};

export const detemplateOneScriptExecutionItem = (
    item: ScriptExecutionItem,
    loadedProject: LoadedLaobanProject,
    makeDictionary: ScriptExecutionItemTemplateDictionaryFn = makeScriptExecutionItemTemplateDictionary
): ErrorsOr<ScriptExecutionItem, TemplateIssue> => {
    const dictionary = makeDictionary(item, loadedProject);
    const rendered = renderTemplate(
        item.command.command,
        dictionary,
        {  onMissing: "error" }
    );

    return mapErrorsOr(
        rendered,
        command => ({
            ...item,
            command: {
                ...item.command,
                command
            }
        })
    );
};

export const detemplateScriptExecutionPlan = (
    plan: ScriptExecutionItem[][],
    loadedProject: LoadedLaobanProject,
    observability: Observability,
    makeDictionary: ScriptExecutionItemTemplateDictionaryFn = makeScriptExecutionItemTemplateDictionary
): ErrorsOr<ScriptExecutionItem[][], TemplateIssue> =>
    flatmapArrayOfArrayOfErrorsOr(
        plan,
        item => detemplateOneScriptExecutionItem(item, loadedProject, makeDictionary)
    );