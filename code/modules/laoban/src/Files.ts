//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import * as fs from "fs";
import * as path from "path";
import { HasLaobanDirectory, PackageDetails, PackageDetailsAndDirectory } from "./config";
import { Debug } from "@laoban/debug";
import { childDirs, FileOps, findMatchingK, parseJson } from "@laoban/fileops";
import { findFileUp } from "@laoban/fileops";


export let loabanConfigName = 'laoban.json'
export let loabanConfigTestName = '.laoban.test.json'
export let packageDetailsFile = 'package.details.json'
export let packageDetailsTestFile = '.package.details.test.json'

export function laobanFile ( dir: string ) { return path.join ( dir, loabanConfigName )}

export function findLaobanOrUndefined ( directory: string ): string | undefined {
  function find ( dir: string ): string {
    let fullName = path.join ( dir, loabanConfigName );
    if ( fs.existsSync ( fullName ) ) return dir
    let parse = path.parse ( dir )
    if ( parse.dir === parse.root ) return undefined
    return find ( parse.dir )
  }
  return find ( directory )
}
export function findLaoban ( directory: string ): string {
  const dir = findLaobanOrUndefined ( directory )
  if ( dir === undefined ) {throw Error ( `Cannot find laoban.json. Started looking in ${directory}` )}
  return dir
}

export async function findVersionNumber ( fileOps: FileOps, dir: string ): Promise<string> {
  const packageJsonDir = await findFileUp ( dir, async s => fileOps.isFile ( fileOps.join ( packageJsonDir, 'package.json' ) ) )
  return fileOps.loadFileOrUrl ( fileOps.join ( packageJsonDir, 'package.json' ) ).then ( s => JSON.parse ( s ).version )
}

interface PackageDetailOptions {
  all?: boolean,
  one?: boolean,
  packages?: string,
}
export class PackageDetailFiles {
  static workOutPackageDetails ( fileOps: FileOps, hasRoot: HasLaobanDirectory & { debug: Debug }, options: PackageDetailOptions ): Promise<PackageDetailsAndDirectory[]> {
    let p = hasRoot.debug ( 'projects' )
    let root = hasRoot.laobanDirectory
    // p.message(() =>['p.message'])
    function find () {
      if ( options.packages ) return p.k ( () => `options.projects= [${options.packages}]`, () =>
        PackageDetailFiles.findAndLoadPackageDetailsFromChildren ( fileOps, root ).then ( pd => pd.filter ( p => p.directory.match ( options.packages ) ) ) )
      if ( options.all ) return p.k ( () => "options.allProjects", () => PackageDetailFiles.findAndLoadPackageDetailsFromChildren ( fileOps, root ) );
      if ( options.one ) return p.k ( () => "optionsOneProject", () => PackageDetailFiles.loadPackageDetails ( fileOps ) ( process.cwd () ).then ( x => [ x ] ) )
      return PackageDetailFiles.loadPackageDetails ( fileOps ) ( process.cwd () ).then ( pd => {
          p.message ( () => [ "using default project rules. Looking in ", process.cwd (), 'pd.details', pd.packageDetails ? pd.packageDetails.name : `No ${packageDetailsFile} found` ] )
          return pd.packageDetails ?
            p.k ( () => 'Using project details from process.cwd()', () => PackageDetailFiles.loadPackageDetails ( fileOps ) ( process.cwd () ) ).then ( x => [ x ] ) :
            p.k ( () => 'Using project details under root', () => PackageDetailFiles.findAndLoadPackageDetailsFromChildren ( fileOps, root ) )
        }
      )
    }
    return find ().then ( pds => {
      p.message ( () => [ 'found', ...pds.map ( p => p.directory ) ] );
      return pds
    } )
  }


  static async findAndLoadPackageDetailsFromChildren ( fileOps: FileOps, root: string ): Promise<PackageDetailsAndDirectory[]> {
    let dirs = await this.findPackageDirectories ( fileOps ) ( root );
    return Promise.all ( dirs.map ( this.loadPackageDetails ( fileOps ) ) )
  }

  static loadPackageDetails = ( fileOps: FileOps ) => async ( directory: string ): Promise<PackageDetailsAndDirectory> => {
    try {
      let rootAndFileName = fileOps.join ( directory, packageDetailsFile );
      const asString = await fileOps.loadFileOrUrl ( rootAndFileName );
      try {
        let packageDetails = asString && parseJson<PackageDetails> ( `File ${rootAndFileName}` ) ( asString );
        return { directory, packageDetails }
      } catch ( e ) {
        return { directory, errorParsing: true }
      }
    } catch ( e ) {
      return { directory }
    }
  };

  static findPackageDirectories = ( fileOps: FileOps ) => async ( root: string ): Promise<string[]> => {
    const findDescs = childDirs ( fileOps, s => s === 'node_modules' || s === '.git' || s === '.session' )
    const descs = await findDescs ( root )

    let result = findMatchingK ( descs, s => fileOps.isFile ( path.join ( s, packageDetailsFile ) ) );
    return result
  };
}


