//This is an integration test, but it's quite important
//The validation is a big part of the user experience
//The possible interactions between different parts of the validation are quite large..
//I suspect it will be a pain to keep these validation messages correct, so we might want to do something in the matching in the future

import * as fs from "fs";
import * as path from "path";
import { findLaoban, ProjectDetailFiles } from "./Files";
import { validateProjectDetailsAndTemplates } from "./validation";
import { Config } from "./config";
import { loadConfigOrIssues, loadLoabanJsonAndValidate } from "./configProcessor";
import { dirsIn, testRoot } from "./fixture";
// @ts-ignore
import { addDebug } from "@phil-rice/debug";
import { fileOps } from "@phil-rice/files";

const laobanDir = findLaoban ( process.cwd() )

describe ( "validate laoban json", () => {
  dirsIn ( testRoot ).forEach ( testDir => {
    it ( `should check the laobon.json validation for ${testDir}`, () => {
      let parsed = path.parse ( testDir )
      let expected = fs.readFileSync ( path.join ( testRoot, testDir, 'expectedValidationLaoban.txt' ) ).toString ().split ( '\n' ).map ( s => s.trim () ).filter ( s => s.length > 0 )
      loadConfigOrIssues ( process.stdout, [ 'param1', 'param2' ], loadLoabanJsonAndValidate ( fileOps, laobanDir, undefined, false ), false ) ( path.join ( testRoot, testDir ) ).then ( configOrIssues => {
        expect ( configOrIssues.issues ).toEqual ( expected )
      } )
    } )
  } )
} )

describe ( "validate directories", () => {
  dirsIn ( testRoot ).forEach ( testDir => {
    let parsed = path.parse ( testDir )
    loadConfigOrIssues ( process.stdout, [ 'param1', 'param2' ], loadLoabanJsonAndValidate ( fileOps, laobanDir, undefined, false ), false ) ( testDir ).then ( configOrIssues => {
      if ( configOrIssues.issues.length == 0 ) {
        it ( `should check the laoban.json and if that's ok, check the files under${testDir}`, async () => {
          let expected = fs.readFileSync ( path.join ( testDir, 'expectedValidateProjectDetailsAndTemplate.txt' ) ).toString ().trim ()
          let config = addDebug ( undefined, () => {} ) ( configOrIssues.config )
          return ProjectDetailFiles.workOutProjectDetails ( config, {} ).//
            then ( pds => validateProjectDetailsAndTemplates ( config, pds ) ).//
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
