//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
//This is an integration test, but it's quite important
//The validation is a big part of the user experience
//The possible interactions between different parts of the validation are quite large..
//I suspect it will be a pain to keep these validation messages correct, so we might want to do something in the matching in the future

import * as fs from "fs";
import { findLaoban, PackageDetailFiles } from "./Files";
import { validatePackageDetailsAndTemplates } from "./validation";
import { loadConfigOrIssues, loadLoabanJsonAndValidate, makeCache } from "./configProcessor";
import { configTestRoot, dirsIn } from "./fixture";
import { addDebug } from "@laoban/debug";
import { fileOpsNode } from "@laoban/filesops-node";
import { simplePath } from "@laoban/fileops";

const laobanDir = findLaoban ( process.cwd () )
const path = simplePath
const fileOps = fileOpsNode ();
describe ( "validate laoban json", () => {
  dirsIn ( configTestRoot ).forEach ( testDir => {
    it ( `should check the laobon.json validation for ${testDir}`, async() => {
      let expected = fs.readFileSync ( path.join ( configTestRoot, testDir, 'expectedValidationLaoban.txt' ) ).toString ().split ( '\n' ).map ( s => s.trim () ).filter ( s => s.length > 0 )
      loadConfigOrIssues ( path, process.stdout, [ 'param1', 'param2' ], loadLoabanJsonAndValidate ( fileOps, makeCache ( laobanDir ), false ), false ) ( path.join ( configTestRoot, testDir ) ).then ( configOrIssues => {
        expect ( configOrIssues.issues ).toEqual ( expected )
      } )
    } )
  } )
} )

describe ( "validate directories", () => {
  dirsIn ( configTestRoot ).forEach ( testDir => {
    loadConfigOrIssues ( path, process.stdout, [ 'param1', 'param2' ], loadLoabanJsonAndValidate ( fileOps, makeCache ( laobanDir ), false ), false ) ( testDir ).then ( configOrIssues => {
      if ( configOrIssues.issues.length == 0 ) {
        it ( `should check the laoban.json and if that's ok, check the files under${testDir}`, async () => {
          let expected = fs.readFileSync ( path.join ( testDir, 'expectedValidateProjectDetailsAndTemplate.txt' ) ).toString ().trim ()
          let config = addDebug ( undefined, () => {} ) ( configOrIssues.config )
          return PackageDetailFiles.workOutPackageDetails ( fileOps, config, {} ).//
            then ( pds => validatePackageDetailsAndTemplates ( fileOps, config, pds ) ).//
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
