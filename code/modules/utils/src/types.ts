export interface FileOps {
  loadFile: ( fileOrUrl: string ) => Promise<string>
  loadFileSync: ( fileOrUrl: string ) => string
}