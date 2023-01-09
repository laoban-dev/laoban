//This is an integration test, but it's quite important
//The validation is a big part of the user experience
//The possible interactions between different parts of the validation are quite large..
//I suspect it will be a pain to keep these validation messages correct, so we might want to do something in the matching in the future

import * as fs from "fs";
import * as path from "path";
import { findLaoban, PackageDetailFiles } from "./Files";
import { validatePackageDetailsAndTemplates } from "./validation";
import { loadConfigOrIssues, loadLoabanJsonAndValidate, makeCache } from "./configProcessor";
import { dirsIn, configTestRoot } from "./fixture";
// @ts-ignore
import { addDebug } from "@laoban/debug";
import { fileOpsNode } from "@laoban/filesOps-node";

const laobanDir = findLaoban ( process.cwd () )

describe ( "validate laoban json", () => {
  dirsIn ( configTestRoot ).forEach ( testDir => {
    it ( `should check the laobon.json validation for ${testDir}`, () => {
      let parsed = path.parse ( testDir )
      let expected = fs.readFileSync ( path.join ( configTestRoot, testDir, 'expectedValidationLaoban.txt' ) ).toString ().split ( '\n' ).map ( s => s.trim () ).filter ( s => s.length > 0 )
      loadConfigOrIssues ( process.stdout, [ 'param1', 'param2' ], loadLoabanJsonAndValidate ( fileOpsNode, makeCache ( laobanDir ), false ), false ) ( path.join ( configTestRoot, testDir ) ).then ( configOrIssues => {
        expect ( configOrIssues.issues ).toEqual ( expected )
      } )
    } )
  } )
} )

describe ( "validate directories", () => {
  dirsIn ( configTestRoot ).forEach ( testDir => {
    let parsed = path.parse ( testDir )
    loadConfigOrIssues ( process.stdout, [ 'param1', 'param2' ], loadLoabanJsonAndValidate ( fileOpsNode, makeCache ( laobanDir ), false ), false ) ( testDir ).then ( configOrIssues => {
      if ( configOrIssues.issues.length == 0 ) {
        it ( `should check the laoban.json and if that's ok, check the files under${testDir}`, async () => {
          let expected = fs.readFileSync ( path.join ( testDir, 'expectedValidateProjectDetailsAndTemplate.txt' ) ).toString ().trim ()
          let config = addDebug ( undefined, () => {} ) ( configOrIssues.config )
          return PackageDetailFiles.workOutPackageDetails ( fileOpsNode, config, {} ).//
            then ( pds => validatePackageDetailsAndTemplates (fileOpsNode, config, pds ) ).//
            then ( actual => {
                let expected = fs.readFileSync ( path.join ( testDir, 'expectedValidateProjectDetailsAndTemplate.txt' ) ).toString ().split ( '\n' ).map ( s => s.trim () ).filter ( s => s.length > 0 )
                expect ( actual ).toEqual ( expected )
              },
              e => {
                let expected = fs.readFileSync ( path.join ( testDir, 'expectedValidateProjectDetailsAndTemplate.txt' ) ).toString ().trim ()
                let msgLine1: string = e.message.split ( "\n" )[ 0 ];
                expect ( msgLine1 ).toEqual ( expected )
              } )//
        } )
      }
    } )
  } )
} )
