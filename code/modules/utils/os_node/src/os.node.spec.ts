import * as os from "node:os"
import { nodeOsOps } from "./os.node"

describe("nodeOsOps", () => {
    test("cpuCount delegates to node os.cpus length with a minimum of 1", () => {
        expect(nodeOsOps.cpuCount()).toBe(Math.max(1, os.cpus().length))
    })
})