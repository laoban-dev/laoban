
import path from "path";
import { FileOps } from "./fileOps";

export interface LocationAndErrors {
  location: string
  raw: string
  errors: string[]
}
export const isLocationAndErrors = <T> ( x: LocationAndContents<T> ): x is LocationAndErrors => {
  const a: any = x
  return a && a.location && a.raw && a.errors
}
export interface LocationAnd<T> {
  location: string
  directory: string
  contents: T
}
export interface LocationAndParsed<T> extends LocationAnd<T> {
  original: string
}
export const parseLocationAnd = <T> ( context: string, parser: ( context: string ) => ( s: string ) => T ) => ( l: LocationAnd<string> ): LocationAndParsed<T> => ({
  location: l.location,
  directory: l.directory,
  contents: parser ( `${context} ${l.location}` ) ( l.contents ),
  original: l.contents
});
export const isLocationAnd = <T> ( x: LocationAndContents<T> ): x is LocationAnd<T> => {
  const a: any = x
  return a && a.location && a.contents
}
export const isLocationAndParsed = <T> ( x: LocationAndContents<T> ): x is LocationAndParsed<T> => {
  const a: any = x
  return a && a.location && a.contents && a.original
}
export type LocationAndContents<T> = LocationAnd<T> | LocationAndErrors
export type LocationAndParsedOrErrors<T> = LocationAndParsed<T> | LocationAndErrors

export function partitionLocationAndContents<T> ( ls: LocationAndContents<T>[] ) {
  const locationAnd: LocationAnd<T> [] = ls.filter ( isLocationAnd )
  const locationAndErrors: LocationAndErrors[] = ls.filter ( isLocationAndErrors )
  return { locationAnd, locationAndErrors }
}
export const fileContentAndLocation = <T> ( file: string, parser: ( s: string ) => T ) => async ( fileOps: FileOps, directory: string ): Promise<LocationAndParsedOrErrors<T>> => {
  let location: string = path.join ( directory, file );
  const original = await fileOps.loadFileOrUrl ( location )
  try {
    const contents = parser ( original )
    return { location, original, contents, directory }
  } catch ( error ) {
    return { location, raw: original, errors: [ `Èrror parsing` ] }
  }
}


export const fileContentAndLocations = <T> ( file: string, parser: ( context: string ) => ( s: string ) => T ) => async ( context: string, fileOps: FileOps, directories: string[] ): Promise<LocationAndParsedOrErrors<T>[]> => {
  return Promise.all ( directories.map ( d => fileContentAndLocation ( file, parser ( `${context} ${d}` ) ) ( fileOps, d ) ) )
}
