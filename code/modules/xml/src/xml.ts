export interface Xml {
  parse ( s: string, arrayList?: string|string[] ): any
  print ( s: any ): string

  part ( s: any, path: string ): any
}

