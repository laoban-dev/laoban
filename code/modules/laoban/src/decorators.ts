//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { GuardDefn, guardFrom, isFullGuard, ScriptInContext } from "./config";
import * as path from "path";
import { chain, output, partition, writeTo } from "./utils";
import { splitGenerationsByLinksUsingGenerations } from "./generations";
import * as fs from "fs";
import { CommandDetails, ExecuteCommand, ExecuteGeneration, ExecuteGenerations, ExecuteScriptWithStreams, Generations, ShellCommandDetails, ShellResult } from "./executors";
import { derefence, dollarsBracesVarDefn } from "@laoban/variables";
import { flatten, safeArray } from "@laoban/utils";

export type CommandDecorator = ( e: ExecuteCommand ) => ExecuteCommand
export type ScriptDecorator = ( e: ExecuteScriptWithStreams ) => ExecuteScriptWithStreams
export type GenerationDecorator = ( e: ExecuteGeneration ) => ExecuteGeneration
export type GenerationsDecorator = ( e: ExecuteGenerations ) => ExecuteGenerations

export type AppendToFileIf = ( condition: any | undefined, name: string, content: () => string ) => Promise<void>

interface ToFileDecorator {
  appendCondition: ( d: ShellCommandDetails<CommandDetails> ) => any | undefined
  filename: ( d: ShellCommandDetails<CommandDetails> ) => string
  content: ( d: ShellCommandDetails<CommandDetails>, res: ShellResult ) => string
}

interface GuardDecorator {
  name: string,
  guard: ( d: ShellCommandDetails<CommandDetails> ) => GuardDefn | undefined
  valid: ( guardType: string, guard: GuardDefn | undefined, d: ShellCommandDetails<CommandDetails> ) => any
}

interface StdOutDecorator {
  condition: ( d: ShellCommandDetails<CommandDetails> ) => any | undefined,
  pretext: ( d: ShellCommandDetails<CommandDetails> ) => string,
  transform: ( sr: ShellResult ) => ShellResult,
  posttext: ( d: ShellCommandDetails<CommandDetails>, sr: ShellResult ) => string
}
const shouldAppend = ( d: ShellCommandDetails<CommandDetails> ) => !d.scriptInContext.dryrun;
const dryRunContents = ( d: ShellCommandDetails<CommandDetails> ) => {
  let trim = trimmedDirectory ( d.scriptInContext )
  return `${trim ( d.details.directory ).padEnd ( d.scriptInContext.dirWidth )} ${d.details.commandString}`;
}


function calculateVariableText ( d: ShellCommandDetails<CommandDetails> ): string {
  let dic = d.details.dic
  let simplerdic = { ...dic }
  delete simplerdic.scripts
  delete simplerdic.outputStream
  return [ `Raw command is [${d.details.command.command}] became [${d.details.commandString}]`,
    "legal variables are",
    JSON.stringify ( simplerdic, null, 2 ) ].join ( "\n" ) + "\n"
}

interface GenerationsDecoratorTemplate {
  name: string,
  condition: ( scd: ScriptInContext ) => boolean,
  transform: ( scd: ScriptInContext, g: Generations ) => Generations
}

function trimmedDirectory ( sc: ScriptInContext ) {
  return ( dir: string ) => dir.substring ( sc.config.laobanDirectory.length + 1 )
}


export class ScriptDecorators {

  static normalDecorators (): ScriptDecorator {
    return s => s
    // return chain( [ this.shellDecoratorForScript ] ) <--- if more than one use this
  }
  // static shellDecoratorForScript: ScriptDecorator = e => scd => {
  //   console.log("shellDecoratorForScript", scd )
  //   if ( scd.scriptInContext.shell && !scd.scriptInContext.dryrun )
  //     scd.logStreams.write ( '*' + scd.detailsAndDirectory.directory + '\n' )
  //   return e ( scd )
  // }
}

export class GenerationDecorators {
  static normalDecorators (): GenerationDecorator {
    return e => d => e ( d ) //i.e. nothing added
  }
}

export class GenerationsDecorators {
  static normalDecorators (): GenerationsDecorator {
    return chain ( [ this.PlanDecorator, this.ThrottlePlanDecorator, this.LinkPlanDecorator ].map ( this.applyTemplate ) )
  }

  static PlanDecorator: GenerationsDecoratorTemplate = {
    name: 'plan',
    condition: scd => scd.genPlan,
    transform: ( sc, gens ) => {
      let trim = trimmedDirectory ( sc )
      function log ( ...s: any[] ) {return output ( sc.config ) ( s.join ( ' ' ) + "\n" )}
      if ( sc.dryrun ) {
        gens.forEach ( ( gen, i ) => {
          log ( "Generation", i )
          gen.forEach ( scd => {
            if ( scd.scriptInContext.details.commands.length == 1 )
              log ( '   ', trim ( scd.detailsAndDirectory.directory ), scd.scriptInContext.details.commands[ 0 ].command )
            else {
              log ( '   ', trim ( scd.detailsAndDirectory.directory ) )
              scd.scriptInContext.details.commands.forEach ( c => log ( '       ', c.command ) )
            }
          } )
        } )
      } else gens.forEach ( ( gen, i ) => log ( "Generation", i, gen.map ( scd => trim ( scd.detailsAndDirectory.directory ) ).join ( ", " ) ) )
      return []
    }
  }
  static ThrottlePlanDecorator: GenerationsDecoratorTemplate = {
    name: 'throttle',
    condition: scd => scd.throttle > 0,
    transform: ( scd, gens ) => flatten ( gens.map ( gen => partition ( gen, scd.throttle ) ) )
  }

  static LinkPlanDecorator: GenerationsDecoratorTemplate = {
    name: 'links',
    condition: scd => scd.links || scd.details.inLinksOrder,
    transform: ( scd, g ) => flatten ( g.map ( splitGenerationsByLinksUsingGenerations ( scd.debug ) ) )
    // transform: ( scd, g ) => flatten ( g.map ( splitGenerationsByLinks ) )
  }

  static applyTemplate: ( t: GenerationsDecoratorTemplate ) => GenerationsDecorator = t => e => gens => {
    if ( gens.length > 0 && gens[ 0 ].length > 0 ) {
      let scd: ScriptInContext = gens[ 0 ][ 0 ].scriptInContext;
      let s = scd.debug ( 'scripts' )
      s.message ( () => [ 'applying GenerationsDecoratorTemplates', 'generationTemplate', t.name, 'generations', gens.length, 'condition', t.condition ( scd ) ] )
      if ( t.condition ( scd ) ) {
        return e ( t.transform ( scd, gens ) )
      }
    }
    return e ( gens )
  }
}


export class CommandDecorators {

  static normalDecorator ( a: AppendToFileIf ): CommandDecorator {
    return chain ( [
      CommandDecorators.dryRun,
      // ...[ CommandDecorators.guard, CommandDecorators.pmGuard, CommandDecorators.osGuard ].map ( CommandDecorators.guardDecorate ),
      ...[ CommandDecorators.guard ].map ( CommandDecorators.guardDecorate ),
      CommandDecorators.log,
      ...[ CommandDecorators.status, CommandDecorators.profile ].map ( CommandDecorators.fileDecorate ( a ) ),
      ...[ CommandDecorators.variablesDisplay, CommandDecorators.shellDisplay ].map ( CommandDecorators.stdOutDecorator )
    ] )
  }

  static fileDecorate: ( a: AppendToFileIf ) => ( fileDecorator: ToFileDecorator ) => CommandDecorator = appendIf => dec => e =>
    d => e ( d ).then ( res => Promise.all ( res.map ( r => appendIf ( dec.appendCondition ( d ) && shouldAppend ( d ), dec.filename ( d ), () => dec.content ( d, r ) ) ) ).then ( () => res ) )


  static status: ToFileDecorator = {
    appendCondition: d => d.details.command.status,
    filename: d => path.join ( d.detailsAndDirectory.directory, d.scriptInContext.config.status ),
    content: ( d, res ) => `${d.scriptInContext.timestamp.toISOString ()} ${res.err === null} ${d.details.command.name}\n`
  }
  static profile: ToFileDecorator = {
    appendCondition: d => d.details.command.name,
    filename: d => path.join ( d.detailsAndDirectory.directory, d.scriptInContext.config.profile ),
    content: ( d, res ) => `${d.scriptInContext.details.name} ${d.details.command.name} ${res.duration}\n`
  }
  static log: CommandDecorator = e => d => {
    let log = path.join ( d.detailsAndDirectory.directory, d.scriptInContext.config.log )
    let newLogString = fs.createWriteStream ( log, { flags: 'a' } )
    newLogString.write ( `${d.scriptInContext.timestamp.toISOString ()} ${d.details.commandString}\n` )
    let newD = { ...d, logStreams: [ ...d.logStreams, newLogString ] }
    return e ( newD ).then ( sr => {
      if ( sr.length === 1 ) {
        const res = sr[ 0 ];
        newLogString.write ( `Took ${res.duration}${res.err ? `, Error was [${res.err}]` : ''}\n` )
      } else {
        const duration = sr.reduce ( ( acc, res ) => acc + res.duration, 0 )
        const errorCodes = sr.map ( res => res.err )
        newLogString.write ( `Took ${duration}${errorCodes.length > 0 ? `Errors was [${errorCodes}]` : ''}\n` )
      }
      return sr
    } )
  }

  static dryRun: CommandDecorator = e => d => {
    if ( d.scriptInContext.dryrun ) {
      d.outputStream.write ( dryRunContents ( d ) + '\n' )
      return Promise.resolve ( [ { duration: 0, details: d, stdout: dryRunContents ( d ), err: null, stderr: "" } ] )
    } else return e ( d )
  }
  static stdOutDecorator: ( dec: StdOutDecorator ) => CommandDecorator = dec => e => d => {
    if ( dec.condition ( d ) ) {
      writeTo ( d.logStreams, dec.pretext ( d ) )
      return e ( d ).then ( sr => sr.map ( r => {
        writeTo ( r.details.logStreams, dec.posttext ( d, r ) )
        return r
      } ) )
    } else return e ( d )
  }

  static shellDisplay: StdOutDecorator = {
    condition: d => d.scriptInContext.details.showShell || (d.scriptInContext.shell && !d.scriptInContext.dryrun),
    pretext: d => `* ${d.detailsAndDirectory.directory} [${d.details.commandString}]\n`,
    transform: sr => sr,
    posttext: ( d, sr ) => ''
  }

  static variablesDisplay: StdOutDecorator = {
    condition: d => d.scriptInContext.variables,
    pretext: d => calculateVariableText ( d ),
    transform: sr => sr,
    posttext: ( d, sr ) => ''
  }

  // static quietDisplay: CommandDecorator = e => d =>//TODO Do we still need this
  //     d.scriptInContext.quiet ? e(d).then(sr => sr.map(r => ({...r, stdout: ''}))) : e(d)


  static guardDecorate: ( guardDecorator: GuardDecorator ) => CommandDecorator = dec => e =>
    async d => {
      let s = d.scriptInContext.debug ( 'scripts' )
      let g = d.scriptInContext.debug ( 'guard' )
      let guard = dec.guard ( d )
      let valid = dec?.valid?. ( dec.name, guard, d );
      let name = d.scriptInContext.details.name;
      g.message ( () => [ `Guard ${dec.name} ${d.detailsAndDirectory.directory} ${name} =${valid}` ] )
      return valid ? e ( d ) : s.k ( () => `Script killed by guard ${dec.name}`, () => Promise.resolve ( [] ) )
    }

  static guard: GuardDecorator = {
    name: 'guard',
    guard: d => d.scriptInContext.details.guard,
    valid: ( guardType: string, guardForScript, d ) => {
      if ( d.scriptInContext.ignoreGuard ) return true
      let s = d.scriptInContext.debug ( 'scripts' )
      let guardDebug = d.scriptInContext.debug ( 'guard' )
      let guardForCommand: GuardDefn | undefined = d.details.command.guard
      let name = d.scriptInContext.details.name;

      const context = ( guardType: string, guard: GuardDefn | GuardDefn[] | undefined ) =>
        `${guardType} ${d.detailsAndDirectory.directory} ${name}. (${guardType} )[${guard ? safeArray ( guard ).map ( g => JSON.stringify ( g ) ).join ( ',' ) : 'undefined'} ]`
      let dic = d.details.dic;
      let validForScript = guardForScript === undefined || evaluateGuard ( context ( 'script ', guardForScript ), guardForScript, dic );
      let validForCommand = guardForCommand === undefined || evaluateGuard ( context ( 'command ', guardForCommand ), guardForCommand, dic );

      let valid = validForScript && validForCommand;

      guardDebug.message ( () => [ `${(context ( '', [ guardForScript, guardForCommand ] ))} script =${validForScript} command =${validForCommand} value =${valid}` ] )
      return valid
    }
  }
  // static osGuard: GuardDecorator = {
  //   name: 'osGuard',
  //   guard: d => d.details.command.osGuard,
  //   valid: ( guardType: string, g, d ) => g === g=== undefined||d.scriptInContext.config.os
  // }
  // static pmGuard: GuardDecorator = {
  //   name: 'pmGuard',
  //   guard: d => d.details.command.pmGuard,
  //   valid: ( guardType: string, g, d ) => g === g=== undefined||d.scriptInContext.config.packageManager
  // }
}
function evaluateGuard ( context: string, g: GuardDefn | undefined, dic: any ): boolean {
  const rawValue = guardFrom ( g )
  if ( typeof rawValue !== 'string' )
    if ( isFullGuard ( g ) ) {throw Error ( `Guard ${context} has a value that is not a string` )} else { throw Error ( `Guard ${context} is not a string` ) }

  let value = derefence ( context, dic, rawValue, { allowUndefined: true, throwError: true, undefinedIs: '', variableDefn: dollarsBracesVarDefn } );
  // console.log ( `In guard ${context} g is ${JSON.stringify(g)} rawValue is [${rawValue} ] value is ${value}`)
  // console.log('dic is ',Object.keys(dic))
  if ( isFullGuard ( g ) && g.default && value == '' ) return true
  if ( isFullGuard ( g ) && g.equals !== undefined ) return g.equals === value
  if ( value === 'false' ) return false
  return value != '';
}
