export interface FileOps {
  // loadFile: ( fileOrUrl: string ) => Promise<string>
  loadFileOrUrl: ( fileOrUrl: string ) => Promise<string>
  loadFileSync: ( fileOrUrl: string ) => string
}