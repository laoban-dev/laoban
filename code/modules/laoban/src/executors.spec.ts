import path from "path";


export function streamNamefn(sessionDir: string, sessionId: string, scriptName: string, directory: string) {
  return path.join(sessionDir,
    sessionId,
    directory.replace(/\//g, '_')) + '.' + scriptName + '.log'
}
describe("streamNamefn", () =>{
  it ("should", () =>{

  })
})