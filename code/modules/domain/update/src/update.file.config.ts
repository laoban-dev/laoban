import {DefaultFileTypes, FileOperationConfig} from "@laoban/file_operations";
import {TemplateSyntax} from "@laoban/template_files";
import {DirectoryName, Filename} from "@laoban/files";
import {PlanManagedFilesFn} from "./plan.file.operations";
import {UpdateManagedFilesFn} from "./update.file.operations";
import {MergeableFileTypes} from "@laoban/file_operations";

export interface LaobanUpdateRunnerConfig
    extends FileOperationConfig<DefaultFileTypes, MergeableFileTypes, TemplateSyntax> {
    start: Filename | DirectoryName
    planManagedFiles: PlanManagedFilesFn
    updateManagedFiles: UpdateManagedFilesFn
}

