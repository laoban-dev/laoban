import {LaobanPackageCliContext} from "@laoban/package_cli";
import {LaobanScriptCliContext} from "@laoban/scripts_cli";
import {LaobanUpdateConfig} from "@laoban/update_cli";
export type LaobanCliContext =
    LaobanPackageCliContext &
    LaobanScriptCliContext &
    LaobanUpdateConfig