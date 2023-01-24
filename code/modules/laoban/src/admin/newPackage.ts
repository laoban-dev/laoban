//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { findAppropriateIfc, findInitFileContents, findInitFileContentsFor, findTemplatePackageJson, InitFileContents, initFileContentsWithParsedLaobanJsonAndProjectDetails, makeOneProjectDetails, makeProjectDetails, TypeCmdOptions } from "./init";
import path from "path";
import { derefence, dollarsBracesVarDefn } from "@laoban/variables";
import { FileOps, loadJsonFileOrUndefined, LocationAnd, LocationAndParsed, parseJson } from "@laoban/fileops";
import { packageDetailsFile, packageDetailsTestFile } from "../Files";
import { execute } from "../executors";
import { ConfigWithDebug } from "../config";
import { loadConfigForAdmin } from "./laoban-admin";
import { Writable } from "stream";
import { findTemplatePackageJsonLookup } from "../loadingTemplates";

interface CreatePackageOptions extends TypeCmdOptions {
  force?: boolean
  packagename?: string
  desc?: string
  nuke?: boolean
  template?: string
}

function packageJsonDetailsForNoPackageJson ( allInitFileContents: InitFileContents[], cmd: CreatePackageOptions, clearDirectory: string, templateName: string ): string {
  const found = allInitFileContents.find ( l => l[ "package.details.json" ].contents.template === cmd.type )

  const dic = {
    packageJson: {
      name: cmd.packagename || path.basename ( clearDirectory ),
      description: cmd.desc || ''
    }
  }
  let packageDetailsRawJson = found[ "package.details.json" ].contents;
  packageDetailsRawJson.template = templateName
  let packageDetailsJson = derefence ( `Making ${packageDetailsFile}`, dic, JSON.stringify ( packageDetailsRawJson, null, 2 ), { variableDefn: dollarsBracesVarDefn } );
  return packageDetailsJson;
}

async function packageDetailsJsonWhenPackageJsonExists ( fileOps: FileOps, parsedLaoBan: any, allInitFileContents: InitFileContents[], cmd: CreatePackageOptions, packageJson: LocationAndParsed<any> ): Promise<string> {

  const initFileContents: initFileContentsWithParsedLaobanJsonAndProjectDetails[] = findInitFileContentsFor ( allInitFileContents, parsedLaoBan );
  const templatePackageJsonLookup = await findTemplatePackageJsonLookup ( fileOps, initFileContents, parsedLaoBan )
  const { contents, location, template } = await makeOneProjectDetails ( initFileContents, cmd.type, packageJson, templatePackageJsonLookup, [] )
  return contents
}

export async function newPackage ( fileOps: FileOps, currentDirectory: string, name: string | undefined, cmd: CreatePackageOptions, params: string[], outputStream: Writable ): Promise<void> {
  const config: ConfigWithDebug = await loadConfigForAdmin ( fileOps, cmd, currentDirectory, params, outputStream )
  const templateName = cmd.template || cmd.type
  if ( !Object.keys ( config.templates ).includes ( templateName ) ) {
    console.error ( `Template ${templateName} not known. Legal values are [${Object.keys ( config.templates )}]` )
    process.exit ( 1 )
  }
  const realName = name === undefined ? '.' : name

  const clearDirectory = path.join ( currentDirectory, realName ).replace ( /\\/g, '/' )
  let targetFile = path.join ( clearDirectory, packageDetailsFile );
  if ( await fileOps.isFile ( targetFile ) )
    if ( !cmd.force && !cmd.nuke ) {
      console.log ( `File ${targetFile} already exists. Use --force to overwrite. --nuke can also be used but it will blow away the entire directory` )
      process.exit ( 1 )
      return
    } else if ( cmd.force ) (console.log ( `Existing ${packageDetailsFile} will be modified as --force was used` ))
  if ( cmd.nuke ) await (fileOps.removeDirectory ( clearDirectory, true ))
  const { type, allInitFileContents } = await findInitFileContents ( fileOps, cmd );
  const packageJson = await loadJsonFileOrUndefined<any> ( ``, fileOps, clearDirectory, 'package.json' )
  let packageDetailsJson = await (packageJson
    ? packageDetailsJsonWhenPackageJsonExists ( fileOps, config, allInitFileContents, cmd, packageJson )
    : Promise.resolve ( packageJsonDetailsForNoPackageJson ( allInitFileContents, cmd, clearDirectory, templateName ) ))
  console.log ( packageDetailsFile, packageDetailsJson )
  await fileOps.createDir ( clearDirectory )
  await fileOps.saveFile ( targetFile, packageDetailsJson )
  const laoban = require ( '../../index' )
  if ( name === undefined ) {
    console.log ( 'Please note: no subdirectory was provided. The current directory was transformed into a package' )
    console.log ()
  }
  console.log ( 'Calling "laoban update"\n' )
  const res = await laoban.runLoaban ( [ process.argv[ 0 ], process.argv[ 1 ], 'update' ] )
}

