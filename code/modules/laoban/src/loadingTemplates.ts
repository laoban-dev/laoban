import { FileOps, flatten, loadFileFromDetails, NameAnd, parseJson } from "@laoban/utils";
import { includeAndTransformFile, loadOneFileFromTemplateControlFileDetails, loadTemplateControlFile } from "./update";
import { Config, ConfigWithDebug } from "./config";

export interface ProjectDetailsAndLocations {
  projectDetails: any
  location: string
}


export function checkTemplates ( pdLs: ProjectDetailsAndLocations[], templates: NameAnd<string> ): string[] {
  return flatten ( pdLs.map ( ( { projectDetails, location } ) => {
    const template = projectDetails.template
    return templates[ template ] === undefined ? [ `Project at ${location} has template ${template} which is not in the templates list. Legal values are ${Object.keys ( templates )}` ] : [];
  } ) )
}

export async function checkLoadingTemplates ( context: string, fileOps: FileOps, config: ConfigWithDebug, templateAndUrls: NameAnd<string> ): Promise<string[]> {
  const errors: string[] = []
  const d = config.debug ( 'templates' )
  await Promise.all ( Object.entries ( templateAndUrls ).map ( async ( [ template, url ] ) => {
    d.message ( () => [ `Trying to  loaded templatecontrol file ${template} at ${url}` ] )
    return loadTemplateControlFile ( context, fileOps, config.laobanDirectory, url ).then (
      tcf => {
        d.message ( () => [ `Successfully loaded templatecontrol file ${template} at ${url}` ] )
        return Promise.all ( tcf.files.map ( async cfd => {
          d.message ( () => [ `Trying to  loaded templatecontrol file ${template} at ${url}` ] )
          return loadFileFromDetails ( `${context}. Template: ${template}] ${JSON.stringify ( cfd )}`, fileOps, url, includeAndTransformFile ( context, {}, fileOps ), cfd )
            .then ( ( { target, postProcessed } ) => d.message ( () => [ `  Checked ${template} ${JSON.stringify ( cfd )}}` ] ),
              error => errors.push ( error ) )
        } ) )
      },
      e => {
        // d.message ( () => [ `Failed to load templatecontrol file ${template} at ${url}.\n${e}` ] )
        errors.push ( `Error loading template ${template} from ${url}: ${e}` )
      }
    )
  } ) )
  // console.log ( 'checkLoadingTemplates errors', errors )
  if ( errors.length > 0 ) {
    return [ `Problems loading templates. List of all templates is ${JSON.stringify ( templateAndUrls, null, 2 )} `, ...errors ]
  } else
    return errors
}

export async function findTemplatePackageJsonLookup ( fileOps: FileOps, pdLs: ProjectDetailsAndLocations[], parsedLaoBan: any ): Promise<NameAnd<any>> {
  const result: NameAnd<any> = {}
  const templateErrors: string[] = checkTemplates ( pdLs, parsedLaoBan.templates )
  if ( templateErrors.length>0) throw Error ( JSON.stringify ( templateErrors, null, 2 ) )
  await Promise.all ( pdLs.map ( async ( { projectDetails, location } ) => {
    const template = projectDetails.template
    if ( result[ template ] === undefined ) {//earlier ones take precedence
      const templateLookup = parsedLaoBan.templates
      let templateUrl = templateLookup[ template ];
      if ( templateUrl === undefined )
        throw Error ( `Error finding template  ${template}. Init is ${location}\nTemplate lookup is ${JSON.stringify ( templateLookup, null, 2 )}
        Is this because you asked for a --type that doesnt support the template ${template} ?` )
      const context = `Transforming file ${templateUrl} for ${location}\nKnown templates are ${JSON.stringify ( templateLookup, null, 2 )}`
      const templatePackageJson = await loadOneFileFromTemplateControlFileDetails ( context, fileOps, templateUrl, includeAndTransformFile ( context, {}, fileOps ) )
      const templateContents = await includeAndTransformFile ( context, { projectDetails }, fileOps ) ( '${}', templatePackageJson )
      result[ template ] = parseJson ( `Finding template package json for template ${template} at ${templateUrl}` ) ( templateContents )
    }
  } ) )
  return result
}
