//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { findInitFileContents, TypeCmdOptions } from "./init";
import path from "path";
import { derefence, dollarsBracesVarDefn } from "@laoban/variables";
import { FileOps } from "@laoban/fileops";
import { packageDetailsFile } from "../Files";
import { execute } from "../executors";
import { ActionParams } from "./types";

interface CreatePackageOptions extends TypeCmdOptions {
  force?: boolean
  packagename?: string
  desc?: string
  nuke?: boolean
  template?: string
}

export async function newPackage ( fileOps: FileOps, directory: string, name: string, cmd: CreatePackageOptions ): Promise<void> {
  const clearDirectory = path.join ( directory, name ).replace ( /\\/g, '/' )
  let targetFile = path.join ( clearDirectory, packageDetailsFile );
  console.log ( targetFile )
  if ( await fileOps.isFile ( targetFile ) && !cmd.force ) {
    console.log ( `Directory ${clearDirectory} already exists. Use --force to overwrite.` )
    process.exit ( 1 )
  }
  if ( cmd.nuke ) await (fileOps.removeDirectory ( clearDirectory, true ))

  console.log ( 'cmd', name, cmd.type, 'initurl', cmd.initurl, 'listTypes', cmd.listTypes )
  const { type, allInitFileContents } = await findInitFileContents ( fileOps, cmd );

  console.log ( 'initData - loaded' )
  const found = allInitFileContents.find ( l => l[ "package.details.json" ].contents.template === cmd.type )
  const dic = {
    packageJson: {
      name: cmd.packagename || path.basename ( clearDirectory ),
      description: cmd.desc || ''
    }
  }
  let packageDetailsRawJson = found[ "package.details.json" ].contents;
  packageDetailsRawJson.template = cmd.template ? cmd.template : cmd.type
  let packageDetailsJson = derefence ( `Making ${packageDetailsFile}`, dic, JSON.stringify ( packageDetailsRawJson, null, 2 ), { variableDefn: dollarsBracesVarDefn } );
  console.log ( packageDetailsJson )
  await fileOps.createDir ( clearDirectory )
  await fileOps.saveFile ( targetFile, packageDetailsJson )
  await execute ( clearDirectory, `laoban update` ).then ( res => console.log ( 'laoban update\n', res ) )

};