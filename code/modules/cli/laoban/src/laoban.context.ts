import {LaobanPackageCliContext} from "@laoban/package_cli";
import {LaobanScriptCliContext} from "@laoban/scripts_cli";

export type LaobanCliContext =
    LaobanPackageCliContext &
    LaobanScriptCliContext;