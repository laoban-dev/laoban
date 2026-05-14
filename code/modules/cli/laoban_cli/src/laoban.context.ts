import {
    NodeReadChannel,
    NodeRef,
    NodeWriteChannel,
} from "@laoban/observability_node"
import {LaobanPackageCliContext} from "@laoban/package_cli"
import {LaobanScriptCliContext} from "@laoban/scripts_cli"
import {LaobanUpdateConfig} from "@laoban/update_cli"
import {NodeExecutorName} from "@laoban/node_execution";

export type LaobanCliContext =
    LaobanPackageCliContext<NodeReadChannel, NodeWriteChannel, NodeRef> &
    LaobanScriptCliContext<NodeReadChannel, NodeWriteChannel, NodeRef, NodeExecutorName> &
    LaobanUpdateConfig