import { NameAnd } from "@laoban/utils";


let orig: NameAnd<string> = {}
export const setOriginalEnv = () => {
  orig = { ...process.env }
}
export const originalEnv = () => orig