import {  } from "@laoban/utils";
import { gatherInitData, isSuccessfulInitData, TypeCmdOptions } from "./init";
import path from "path";
import { derefence, dollarsBracesVarDefn } from "@laoban/variables";
import { packageDetailsFile } from "laoban/dist/src/Files";
import { execute } from "laoban/dist/src/executors";
import { FileOps } from "@laoban/fileops";

interface CreatePackageOptions extends TypeCmdOptions {
  force?: boolean
  packagename?: string
  desc?: string
  nuke?: boolean
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
  const initData = await gatherInitData ( fileOps, clearDirectory, cmd, true )
  if ( isSuccessfulInitData ( initData ) ) {
    console.log ( 'initData - loaded' )
    const found = initData.initFileContents.find ( l => l[ "package.details.json" ].contents.template === cmd.type )
    const dic = {
      packageJson: {
        name: cmd.packagename || path.basename ( clearDirectory ),
        description: cmd.desc || ''
      }
    }
    let packageDetailsJson = derefence ( `Making ${packageDetailsFile}`, dic, JSON.stringify ( found.packageDetails, null, 2 ), { variableDefn: dollarsBracesVarDefn } );
    console.log ( packageDetailsJson )
    await fileOps.createDir ( clearDirectory )
    await fileOps.saveFile ( targetFile, packageDetailsJson )
    await execute ( clearDirectory, `laoban update` )

  }
}