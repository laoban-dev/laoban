import { cleanLineEndings, deepCombineTwoObjects } from "@laoban/utils";
import * as fs from "fs";
import { fastXmlParser } from "./fast-xml-parser";
import { xmlMergeInto } from "@laoban/fileops";

const input = fs.readFileSync ( './src/pom1.test.xml', 'utf8' );
const expectedMerged1 = fs.readFileSync ( './src/pom.merged1.test.xml', 'utf8' );
const expectedMerged2 = fs.readFileSync ( './src/pom.merged2.test.xml', 'utf8' );

const dependencyPath = 'project.dependencies.dependency'
describe ( "Xml", () => {
  it ( "It should load and save xml", () => {
    const txed = fastXmlParser.parse ( input, [ dependencyPath ] )
    const output = fastXmlParser.print ( txed )
    expect ( cleanLineEndings ( output ) ).toEqual ( input )
  } )
  it ( "should merge xml - note that here dependency is an object", () => {
    const toMerge = fastXmlParser.parse ( `
<project>
  <dependencies>
    <dependency>
      <groupId>newGroup1</groupId>
      <artifactId>newArtifactId1</artifactId>
    </dependency>
  </dependencies>
</project>`, [ dependencyPath ] )
    const inp = fastXmlParser.parse ( input, [ dependencyPath ] )
    const txed = deepCombineTwoObjects ( inp, toMerge )
    const output = fastXmlParser.print ( txed )
    expect ( cleanLineEndings ( output ) ).toEqual ( expectedMerged1 )
  } )
  it ( "should merge xml - note that here dependency is an array not an object", () => {
    const toMerge = fastXmlParser.parse ( `
<project>
  <dependencies>
    <dependency>
      <groupId>newGroup1</groupId>
      <artifactId>newArtifactId1</artifactId>
    </dependency>
    <dependency>
      <groupId>newGroup2</groupId>
      <artifactId>newArtifactId2</artifactId>
    </dependency>
  </dependencies>
</project>`, [ dependencyPath ] )
    // console.log('toMerge', JSON.stringify(toMerge))
    const inp = fastXmlParser.parse ( input, [ dependencyPath ] )
    const txed = deepCombineTwoObjects ( inp, toMerge )
    const output = fastXmlParser.print ( txed )
    expect ( cleanLineEndings ( output ) ).toEqual ( expectedMerged2 )
  } )
} )

describe ( "xmlMergeInto", () => {
  const pp = xmlMergeInto
  it ( "should be applicable when it's xmlMergeInto(...files) ", () => {
    expect ( pp.applicable ( 'xmlMergeInto' ) ).toEqual ( false )
    expect ( pp.applicable ( 'other()' ) ).toEqual ( false )
    expect ( pp.applicable ( 'xmlMergeInto(a)' ) ).toEqual ( true )
    expect ( pp.applicable ( 'xmlMergeInto(a,b)' ) ).toEqual ( true )
    expect ( pp.applicable ( 'xmlMergeInto(aaa,bbb123_)' ) ).toEqual ( true )


  } )
} )
