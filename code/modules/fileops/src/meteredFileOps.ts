//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { FileOps} from "./fileOps";
import { isCachedFileOps } from "./cachedFileOps";

export interface MeteredFileOps extends FileOps {
  digestCount (): number
  lastDigested (): string
  loadFileOrUrlCount (): number
  lastLoadedFile (): string

  createDirCount (): number
  lastCreatedDir (): string

  saveFileCount (): number
  savedFiles (): [ string, string ][]
  lastSavedFileName (): string
  lastSavedFile (): string

  listFilesCount (): number

  removeDirectoryCount (): number
  lastRemoveDirectory (): string
}
export function fileOpsStats ( fileOps: FileOps ): any {
  const result: any = {}
  if ( isMeteredFileOps ( fileOps ) ) {
    const { saveFileCount, loadFileOrUrlCount, createDirCount, removeDirectoryCount } = fileOps
    result.saveFileCount = saveFileCount ()
    result.loadFileOrUrlCount = loadFileOrUrlCount ()
    result.createDirCount = createDirCount ()
    result.removeDirectoryCount = removeDirectoryCount ()
  }
  if ( isCachedFileOps ( fileOps ) ) {
    result.cacheHits = fileOps.cacheHits ()
    result.cacheMisses = fileOps.cacheMisses ()
  }
  return result
}
export function isMeteredFileOps ( fileOps: FileOps ): fileOps is MeteredFileOps {
  const a: any = fileOps
  return a.digestCount !== undefined
}
export function meteredFileOps ( fileOps: FileOps ): MeteredFileOps {
  if ( isMeteredFileOps ( fileOps ) ) return fileOps
  let digestCount: number = 0;
  let lastDigested: string = undefined

  let loadFileOrUrlCount: number = 0;
  let lastLoadedFile: string = undefined
  let createDirCount: number = 0;
  let lastCreatedDir: string = undefined;
  let saveFileCount: number = 0;
  let lastSavedFileName: string = undefined;
  let lastSavedFile: string = undefined;
  let listFilesCount: number = 0
  let savedFiles: [ string, string ][] = []
  let removeDirectoryCount: number = 0
  let lastRemoveDirectory: string = undefined

  return {
    ...fileOps,
    createDirCount: () => createDirCount,
    digestCount: () => digestCount,
    lastCreatedDir: () => lastCreatedDir,
    lastSavedFile: () => lastSavedFile,
    lastSavedFileName: () => lastSavedFileName,
    lastDigested: () => lastDigested,
    lastLoadedFile: () => lastLoadedFile,
    loadFileOrUrlCount: () => loadFileOrUrlCount,
    saveFileCount: () => saveFileCount,
    listFilesCount: () => listFilesCount,
    savedFiles: () => savedFiles,
    removeDirectoryCount: () => removeDirectoryCount,
    lastRemoveDirectory: (): string => lastRemoveDirectory,
    createDir ( dir: string ): Promise<string | undefined> {
      createDirCount += 1
      lastCreatedDir = dir
      return fileOps.createDir ( dir );
    },
    loadFileOrUrl ( fileOrUrl: string ): Promise<string> {
      loadFileOrUrlCount += 1
      lastLoadedFile = fileOrUrl
      return fileOps.loadFileOrUrl ( fileOrUrl )
    },
    digest ( s: string ): string {
      digestCount += 1
      lastDigested = s
      return fileOps.digest ( s );
    },
    listFiles ( root: string ): Promise<string[]> {
      listFilesCount += 1
      return fileOps.listFiles ( root )
    },
    saveFile ( filename: string, text: string ): Promise<void> {
      saveFileCount += 1
      lastSavedFile = text
      lastSavedFileName = filename
      savedFiles.push ( [ filename, text ] )
      return fileOps.saveFile ( filename, text )
    },
    removeDirectory ( filename: string, recursive: boolean ): Promise<void> {
      removeDirectoryCount += 1
      lastRemoveDirectory = filename
      return fileOps.removeDirectory ( filename, recursive )
    }
  }
}