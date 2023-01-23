//Copyright (c)2020-2023 Philip Rice. <br />Permission is hereby granted, free of charge, to any person obtaining a copyof this software and associated documentation files (the Software), to dealin the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:  <br />The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED AS
import { FileOps, parseJson } from "./fileOps";
import { allButLastSegment } from "@laoban/utils";

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

export async function loadJsonFileOrUndefined<T> ( context: string, fileOps: FileOps, directory: string, fileName: string ): Promise<LocationAndParsed<T> | undefined> {
  const location = fileOps.join ( directory, fileName );
  try {
    const original = await fileOps.loadFileOrUrl ( location )
    const contents = parseJson<T> ( `${context}Loading ${fileName}` ) ( original )
    return { location, directory, contents, original }
  } catch ( e ) {
    return undefined
  }
}


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
  let location: string = fileOps.join ( directory, file );
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


export const saveOne = ( fileOps: FileOps ) => async ( lc: LocationAnd<string> ): Promise<void> => {
  const { location, directory, contents } = lc
  await fileOps.createDir ( directory )
  return fileOps.saveFile ( location, contents );
}

export const saveAll = ( fileOps: FileOps ) => async ( lcs: LocationAndContents<string>[] ): Promise<void> => {
  await Promise.all ( lcs.map ( saveOne ( fileOps ) ) );
}