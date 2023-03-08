import { Xml } from "@laoban/xml";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { findPart, safeArray, toArray } from "@laoban/utils";

const parserOptions = {
  ignoreAttributes: false
}

const parser = new XMLParser ( parserOptions );

const builderOptions = {
        ignoreAttributes: false,
        format: true
      }
;

const builder = new XMLBuilder ( builderOptions );
export const fastXmlParser: Xml = {
  part: ( s: any, path: string ): any => findPart ( s, path ),
  parse: ( s: string, arrayList ): any => {
    const array = toArray ( arrayList )
    return new XMLParser ( {
      ...parserOptions,
      isArray: ( name, jpath, isLeafNode, isAttribute ) => {
        // console.log('checking is array', name, jpath, isLeafNode, isAttribute)
        if ( array.indexOf ( jpath ) !== -1 ) return true;
      }
    } ).parse ( s );
  },
  print: ( s: any ): string => builder.build ( s )
}