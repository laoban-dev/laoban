import { emptyFileOps, FileOps } from "./fileOps";
import { copyFromTemplate, findTemplateLookup, loadFilesInTemplate, loadTemplateControlFile, mergeFiles, postProcessFiles, saveMergedFiles, SourcedTemplateFileDetailsWithContent, validateTemplates } from "./loadTemplateControlFile";
import { NameAnd } from "@laoban/utils";
import { CopyFileOptions, SourceTemplateFileDetailsSingleOrArray } from "./copyFiles";
import { fileOpsStats, meteredFileOps } from "./meteredFileOps";
import { postProcessorForTest } from "./postProcessor";
import { value } from "@laoban/utils/dist/src/errors";


const js = JSON.stringify ( {
  "files": {
    "package.json": { "templated": "${}", "postProcess": "packageJson()" },
    "index.js": { "sample": true },
    "src": { "sample": true, "directory": { "somefile.js": { postProcess: 'pp' }, "justSpecInJs.js": {} } }
  }
}, null, 2 )
const jsLoaded: NameAnd<SourceTemplateFileDetailsSingleOrArray> = {
  "package.json": { file: "@test@/javascript/package.json", "templated": "${}", "postProcess": "packageJson()", source: [ "@test@/javascript" ] },
  "index.js": { file: "@test@/javascript/index.js", "sample": true, source: [ "@test@/javascript" ] },
  "src": {
    "sample": true, "directory": {
      "somefile.js": { "file": "@test@/javascript/somefile.js", postProcess: 'pp', "source": [ "@test@/javascript" ] },
      "justSpecInJs.js": { "file": "@test@/javascript/justSpecInJs.js", "source": [ "@test@/javascript" ] }
    }, source: [ "@test@/javascript" ]
  }
}

const jsWithContentNoSample: NameAnd<SourcedTemplateFileDetailsWithContent[]> = {
  "index.js": [ { "file": "@test@/javascript/index.js", "name": "index.js", "sample": true, "source": [ "@test@/javascript" ], content: undefined } ],
  "package.json": [ { "content": "{\"tx\":\"${}\",\"@test@/javascript/package.json\":\"content\"}", "target": "package.json", "file": "@test@/javascript/package.json", "name": "package.json", "postProcess": "packageJson()", "source": [ "@test@/javascript" ], "templated": "${}" } ],
  "src": [
    {
      "name": "src", "sample": true, "target": "src", "source": [ "@test@/javascript" ],
      "content": {
        "justSpecInJs.js": [ { "content": "{\"@test@/javascript/justSpecInJs.js\":\"content\"}", "target": "src/justSpecInJs.js", "file": "@test@/javascript/justSpecInJs.js", "name": "justSpecInJs.js", "source": [ "@test@/javascript" ] } ],
        "somefile.js": [ { "content": "{\"@test@/javascript/somefile.js\":\"content\"}", "target": "src/somefile.js", "file": "@test@/javascript/somefile.js", "name": "somefile.js", postProcess: 'pp', "source": [ "@test@/javascript" ] } ]
      },
      "directory": { "justSpecInJs.js": { "file": "@test@/javascript/justSpecInJs.js", "source": [ "@test@/javascript" ] }, "somefile.js": { "file": "@test@/javascript/somefile.js", postProcess: 'pp', "source": [ "@test@/javascript" ] } }
    }
  ]
};

let jsWithContentSample = {
  "index.js": [
    { "content": "{\"@test@/javascript/index.js\":\"content\"}", "target": "index.js", "file": "@test@/javascript/index.js", "name": "index.js", "sample": true, "source": [ "@test@/javascript" ] } ],
  "package.json": [ { "content": "{\"tx\":\"${}\",\"@test@/javascript/package.json\":\"content\"}", "target": "package.json", "file": "@test@/javascript/package.json", "name": "package.json", "postProcess": "packageJson()", "source": [ "@test@/javascript" ], "templated": "${}" } ],
  "src": [
    {
      "name": "src", "sample": true, "target": "src", "source": [ "@test@/javascript" ],
      "content": {
        "justSpecInJs.js": [ { "content": "{\"@test@/javascript/justSpecInJs.js\":\"content\"}", "target": "src/justSpecInJs.js", "file": "@test@/javascript/justSpecInJs.js", "name": "justSpecInJs.js", "source": [ "@test@/javascript" ] } ],
        "somefile.js": [ { "content": "{\"@test@/javascript/somefile.js\":\"content\"}", "target": "src/somefile.js", "file": "@test@/javascript/somefile.js", "name": "somefile.js", postProcess: 'pp', "source": [ "@test@/javascript" ] } ]
      },
      "directory": {
        "justSpecInJs.js": { "file": "@test@/javascript/justSpecInJs.js", "source": [ "@test@/javascript" ] },
        "somefile.js": { "file": "@test@/javascript/somefile.js", postProcess: 'pp', "source": [ "@test@/javascript" ] }
      },
    }
  ]
}

const jsNoSampleMerged: NameAnd<SourcedTemplateFileDetailsWithContent> = {
  "index.js": { "file": "@test@/javascript/index.js", "name": "index.js", "sample": true, content: undefined, "source": [ "@test@/javascript" ] },
  "package.json": { "content": "{\"tx\":\"${}\",\"@test@/javascript/package.json\":\"content\"}", "target": "package.json", "file": "@test@/javascript/package.json", "name": "package.json", "postProcess": "packageJson()", "source": [ "@test@/javascript" ], "templated": "${}" },
  "src": {
    "name": "src", "sample": true, "target": "src", "source": [ "@test@/javascript" ],
    "content": {
      "justSpecInJs.js": { "content": "{\"@test@/javascript/justSpecInJs.js\":\"content\"}", "target": "src/justSpecInJs.js", "file": "@test@/javascript/justSpecInJs.js", "name": "justSpecInJs.js", "source": [ "@test@/javascript" ] },
      "somefile.js": { "content": "{\"@test@/javascript/somefile.js\":\"content\"}", "target": "src/somefile.js", "file": "@test@/javascript/somefile.js", "name": "somefile.js", postProcess: 'pp', "source": [ "@test@/javascript" ] }
    },
    "directory": { "justSpecInJs.js": { "file": "@test@/javascript/justSpecInJs.js", "source": [ "@test@/javascript" ] }, "somefile.js": { "file": "@test@/javascript/somefile.js", postProcess: 'pp', "source": [ "@test@/javascript" ] } },
  }
}
const ts = JSON.stringify ( {
  "parents": [ "@test@/javascript" ],
  deleteFromParents: 'index.js',
  "defaultSrcPrefix": "@test@/typescript",
  "description": "This is the template for typescript",
  "documentation": "",
  "repository": "",
  "files": {
    ".npmrc": { "postProcess": "checkEnv(NPM_TOKEN)" },
    "jest.config.json": {},
    "tsconfig.json": {},
    "index.ts": { "sample": true },
    "src": { "directory": { "somefile.js": { postProcess: 'ppts' }, "justts.ts": {} } },
    "package.json": {
      "file": "./package.json", "templated": "${}", "mergeWithParent": "jsonMerge", "postProcess": "packageJsonSort"
    }
  }
}, null, 2 )
const tsLoaded: NameAnd<SourceTemplateFileDetailsSingleOrArray> = {
  ".npmrc": { file: "@test@/typescript/.npmrc", "postProcess": "checkEnv(NPM_TOKEN)", "source": [ "@test@/typescript" ] },
  "jest.config.json": { file: "@test@/typescript/jest.config.json", "source": [ "@test@/typescript" ] },
  "tsconfig.json": { file: "@test@/typescript/tsconfig.json", "source": [ "@test@/typescript" ] },
  "index.ts": { "sample": true, file: "@test@/typescript/index.ts", "source": [ "@test@/typescript" ] },

  "src": {
    directory: {
      "justSpecInJs.js": { "file": "@test@/javascript/justSpecInJs.js", "source": [ "@test@/javascript" ] },
      "justts.ts": { "file": "@test@/typescript/justts.ts", "source": [ "@test@/typescript" ] },
      "somefile.js": [ // in twice because we asked for it in the javascript template, and are overwriting it with the typescript template
        { "file": "@test@/javascript/somefile.js", postProcess: 'pp', "source": [ "@test@/javascript" ] },
        { "file": "@test@/typescript/somefile.js", postProcess: 'ppts', "source": [ "@test@/typescript" ] }
      ]
    },
    "sample": true, "source": [ "@test@/javascript", "@test@/typescript" ]
  },
  "package.json": [
    { "file": "@test@/javascript/package.json", "postProcess": "packageJson()", "source": [ "@test@/javascript" ], "templated": "${}" },
    { "file": "@test@/typescript/package.json", "templated": "${}", "mergeWithParent": "jsonMerge", "postProcess": "packageJsonSort", "source": [ "@test@/typescript" ] }
  ]
}
const tsContentNoSample: NameAnd<SourcedTemplateFileDetailsWithContent[]> = {
  ".npmrc": [ { "content": "{\"@test@/typescript/.npmrc\":\"content\"}", "target": ".npmrc", "file": "@test@/typescript/.npmrc", "name": ".npmrc", "postProcess": "checkEnv(NPM_TOKEN)", "source": [ "@test@/typescript" ] } ],
  "index.ts": [ { "file": "@test@/typescript/index.ts", "name": "index.ts", "sample": true, "source": [ "@test@/typescript" ], content: undefined } ],
  "jest.config.json": [ { "content": "{\"@test@/typescript/jest.config.json\":\"content\"}", "target": "jest.config.json", "file": "@test@/typescript/jest.config.json", "name": "jest.config.json", "source": [ "@test@/typescript" ] } ],
  "package.json": [
    { "content": "{\"tx\":\"${}\",\"@test@/javascript/package.json\":\"content\"}", "target": "package.json", "file": "@test@/javascript/package.json", "name": "package.json", "postProcess": "packageJson()", "source": [ "@test@/javascript" ], "templated": "${}" },
    { "content": "{\"tx\":\"${}\",\"@test@/typescript/package.json\":\"content\"}", "target": "package.json", "file": "@test@/typescript/package.json", "mergeWithParent": "jsonMerge", "name": "package.json", "postProcess": "packageJsonSort", "source": [ "@test@/typescript" ], "templated": "${}" } ],
  "src": [ {
    "name": "src", "sample": true, "target": "src", "source": [ "@test@/javascript", "@test@/typescript" ],
    "content": {
      "justSpecInJs.js": [ { "content": "{\"@test@/javascript/justSpecInJs.js\":\"content\"}", "target": "src/justSpecInJs.js", "file": "@test@/javascript/justSpecInJs.js", "name": "justSpecInJs.js", "source": [ "@test@/javascript" ] } ],
      "justts.ts": [ { "content": "{\"@test@/typescript/justts.ts\":\"content\"}", "target": "src/justts.ts", "file": "@test@/typescript/justts.ts", "name": "justts.ts", "source": [ "@test@/typescript" ] } ],
      "somefile.js": [ { "content": "{\"@test@/javascript/somefile.js\":\"content\"}", "target": "src/somefile.js", "file": "@test@/javascript/somefile.js", "name": "somefile.js", "postProcess": "pp", "source": [ "@test@/javascript" ] },
        { "content": "{\"@test@/typescript/somefile.js\":\"content\"}", "target": "src/somefile.js", "file": "@test@/typescript/somefile.js", "name": "somefile.js", "postProcess": "ppts", "source": [ "@test@/typescript" ] } ]
    },
    "directory": {
      "justSpecInJs.js": { "file": "@test@/javascript/justSpecInJs.js", "source": [ "@test@/javascript" ] },
      "justts.ts": { "file": "@test@/typescript/justts.ts", "source": [ "@test@/typescript" ] },
      "somefile.js": [
        { "file": "@test@/javascript/somefile.js", "postProcess": "pp", "source": [ "@test@/javascript" ] },
        { "file": "@test@/typescript/somefile.js", "postProcess": "ppts", "source": [ "@test@/typescript" ] } ]
    },
  }
  ],
  "tsconfig.json": [ { "content": "{\"@test@/typescript/tsconfig.json\":\"content\"}", "target": "tsconfig.json", "file": "@test@/typescript/tsconfig.json", "name": "tsconfig.json", "source": [ "@test@/typescript" ] } ]
}

const tsContentSample: NameAnd<SourcedTemplateFileDetailsWithContent[]> = {
  ".npmrc": [ { "content": "{\"@test@/typescript/.npmrc\":\"content\"}", "target": ".npmrc", "file": "@test@/typescript/.npmrc", "name": ".npmrc", "postProcess": "checkEnv(NPM_TOKEN)", "source": [ "@test@/typescript" ] } ],
  "index.ts": [ { "content": "{\"@test@/typescript/index.ts\":\"content\"}", "target": "index.ts", "file": "@test@/typescript/index.ts", "name": "index.ts", "sample": true, "source": [ "@test@/typescript" ] } ],
  "jest.config.json": [ { "content": "{\"@test@/typescript/jest.config.json\":\"content\"}", "target": "jest.config.json", "file": "@test@/typescript/jest.config.json", "name": "jest.config.json", "source": [ "@test@/typescript" ] } ],
  "package.json": [
    { "content": "{\"tx\":\"${}\",\"@test@/javascript/package.json\":\"content\"}", "target": "package.json", "file": "@test@/javascript/package.json", "name": "package.json", "postProcess": "packageJson()", "source": [ "@test@/javascript" ], "templated": "${}" },
    { "content": "{\"tx\":\"${}\",\"@test@/typescript/package.json\":\"content\"}", "target": "package.json", "file": "@test@/typescript/package.json", "mergeWithParent": "jsonMerge", "name": "package.json", "postProcess": "packageJsonSort", "source": [ "@test@/typescript" ], "templated": "${}" } ],
  "src": [ {
    "name": "src", "sample": true, "target": "src", "source": [ "@test@/javascript", "@test@/typescript" ],
    "content": {
      "justSpecInJs.js": [ { "content": "{\"@test@/javascript/justSpecInJs.js\":\"content\"}", "target": "src/justSpecInJs.js", "file": "@test@/javascript/justSpecInJs.js", "name": "justSpecInJs.js", "source": [ "@test@/javascript" ] } ],
      "justts.ts": [ { "content": "{\"@test@/typescript/justts.ts\":\"content\"}", "target": "src/justts.ts", "file": "@test@/typescript/justts.ts", "name": "justts.ts", "source": [ "@test@/typescript" ] } ],
      "somefile.js": [
        { "content": "{\"@test@/javascript/somefile.js\":\"content\"}", "target": "src/somefile.js", "file": "@test@/javascript/somefile.js", "name": "somefile.js", "postProcess": "pp", "source": [ "@test@/javascript" ] },
        { "content": "{\"@test@/typescript/somefile.js\":\"content\"}", "target": "src/somefile.js", "file": "@test@/typescript/somefile.js", "name": "somefile.js", "postProcess": "ppts", "source": [ "@test@/typescript" ] } ]
    },
    "directory": {
      "justSpecInJs.js": { "file": "@test@/javascript/justSpecInJs.js", "source": [ "@test@/javascript" ] },
      "justts.ts": { "file": "@test@/typescript/justts.ts", "source": [ "@test@/typescript" ] },
      "somefile.js": [
        { "file": "@test@/javascript/somefile.js", "postProcess": "pp", "source": [ "@test@/javascript" ] },
        { "file": "@test@/typescript/somefile.js", "postProcess": "ppts", "source": [ "@test@/typescript" ] }
      ]
    },
  } ],
  "tsconfig.json": [ { "content": "{\"@test@/typescript/tsconfig.json\":\"content\"}", "target": "tsconfig.json", "file": "@test@/typescript/tsconfig.json", "name": "tsconfig.json", "source": [ "@test@/typescript" ] } ]
}

const tsSampleMerged: NameAnd<SourcedTemplateFileDetailsWithContent> = {
  ".npmrc": { "content": "{\"@test@/typescript/.npmrc\":\"content\"}", "target": ".npmrc", "file": "@test@/typescript/.npmrc", "name": ".npmrc", "postProcess": "checkEnv(NPM_TOKEN)", "source": [ "@test@/typescript" ] },
  "index.ts": { "content": "{\"@test@/typescript/index.ts\":\"content\"}", "target": "index.ts", "file": "@test@/typescript/index.ts", "name": "index.ts", "sample": true, "source": [ "@test@/typescript" ] },
  "jest.config.json": { "content": "{\"@test@/typescript/jest.config.json\":\"content\"}", "target": "jest.config.json", "file": "@test@/typescript/jest.config.json", "name": "jest.config.json", "source": [ "@test@/typescript" ] },
  "package.json": {
    "content": "{\n  \"tx\": \"${}\",\n  \"@test@/javascript/package.json\": \"content\",\n  \"@test@/typescript/package.json\": \"content\"\n}",
    "target": "package.json", "file": "@test@/typescript/package.json", "mergeWithParent": "jsonMerge", "name": "package.json", "postProcess": "packageJsonSort", "source": [ "@test@/javascript", "@test@/typescript" ], "templated": "${}"
  },
  "src": {
    "name": "src", "sample": true, "target": "src", "source": [ "@test@/javascript", "@test@/typescript" ],
    "content": {
      "justSpecInJs.js": { "content": "{\"@test@/javascript/justSpecInJs.js\":\"content\"}", "target": "src/justSpecInJs.js", "file": "@test@/javascript/justSpecInJs.js", "name": "justSpecInJs.js", "source": [ "@test@/javascript" ] },
      "justts.ts": { "content": "{\"@test@/typescript/justts.ts\":\"content\"}", "target": "src/justts.ts", "file": "@test@/typescript/justts.ts", "name": "justts.ts", "source": [ "@test@/typescript" ] },
      "somefile.js": { "content": "{\"@test@/typescript/somefile.js\":\"content\"}", "target": "src/somefile.js", "file": "@test@/typescript/somefile.js", "name": "somefile.js", "postProcess": "ppts", "source": [ "@test@/javascript", "@test@/typescript" ] }
    },
    "directory": {
      "justSpecInJs.js": { "file": "@test@/javascript/justSpecInJs.js", "source": [ "@test@/javascript" ] }, "justts.ts": { "file": "@test@/typescript/justts.ts", "source": [ "@test@/typescript" ] },
      "somefile.js": [
        { "file": "@test@/javascript/somefile.js", "postProcess": "pp", "source": [ "@test@/javascript" ] },
        { "file": "@test@/typescript/somefile.js", "postProcess": "ppts", "source": [ "@test@/typescript" ] } ]
    },
  },
  "tsconfig.json": {
    "content": "{\"@test@/typescript/tsconfig.json\":\"content\"}",
    "file": "@test@/typescript/tsconfig.json",
    "name": "tsconfig.json", "target": "tsconfig.json",
    "source": [
      "@test@/typescript"
    ]
  }
};
const fileOps: FileOps = {
  ...emptyFileOps
  , loadFileOrUrl: async filename => {
    if ( filename.startsWith ( 'notin' ) ) throw new Error ( 'not found' )
    if ( filename.startsWith ( '#doesntparse#' ) ) return '{not json'
    if ( filename === "@test@/javascript/.template.json" ) return js
    if ( filename === "@test@/typescript_405/.template.json" ) return ts
    return `{"${filename}":"content"}`
  }
}

const optionsWithoutSample: CopyFileOptions = {
  tx: async ( type, s ) => s.replace ( /{/, `{"tx":"${type}",` ),
  postProcessor: postProcessorForTest
}
const optionsWithSample: CopyFileOptions = {
  ...optionsWithoutSample, allowSamples: true
}


describe ( "load template file", () => {
  it ( "should load a simple javascript template file, enriching the data in it", async () => {
    await expect ( await loadTemplateControlFile ( `someContext`, fileOps ) ( "@test@/javascript" ) ).toEqual ( { files: jsLoaded } )
  } );
  it ( "should load a typescript template file, enriching the data in it", async () => {
    await expect ( value ( await loadTemplateControlFile ( `someContext`, fileOps ) ( "@test@/typescript_405" ) ).files ).toEqual ( tsLoaded )
  } );
  it ( "should return an error if a file is not found", async () => {
    await expect ( await loadTemplateControlFile ( `someContext`, fileOps ) ( "notin" ) ).toEqual ( [
      "someContext Error loading notin: Error: not found"
    ] )
  } )
  it ( "should return an error if the template control file doesn't parse", async () => {
    await expect ( await loadTemplateControlFile ( `someContext`, fileOps ) ( "#doesntparse#" ) ).toEqual ( [
      "someContext Error loading #doesntparse#: Error: Invalid JSON for someContext. Url #doesntparse#: {not json"
    ] )
  } )
  it ( "should return an error if the template control file doesn't have a files", async () => {
    await expect ( await loadTemplateControlFile ( `someContext`, fileOps ) ( "nofiles" ) ).toEqual ( [
      "Invalid template control file nofiles: someContext. Url nofiles.files is not an object."
    ] )

  } )
} )
describe ( 'loadFiles', () => {
  it ( 'should load simple javascript template files without sample', async () => {
    const loaded = await loadFilesInTemplate ( jsLoaded, fileOps, optionsWithoutSample )
    expect ( loaded ).toEqual ( jsWithContentNoSample )
  } )
  it ( 'should load simple javascript template files with sample', async () => {
    const loaded = await loadFilesInTemplate ( jsLoaded, fileOps, optionsWithSample )
    expect ( loaded ).toEqual ( jsWithContentSample )
  } )
  it ( 'should load typescript template files without sample', async () => {
    const loaded = await loadFilesInTemplate ( tsLoaded, fileOps, optionsWithoutSample )

    expect ( loaded ).toEqual ( tsContentNoSample )
  } )
  it ( 'should load typescript template files withsample', async () => {
    const loaded = await loadFilesInTemplate ( tsLoaded, fileOps, optionsWithSample )
    expect ( loaded ).toEqual ( tsContentSample )
  } )
} )

describe ( "mergeFiles", () => {
  it ( "should merge the simple javascript template files, as there is only zero or one files for each", () => {
    expect ( mergeFiles ( 'someContext' ) ( jsWithContentNoSample ) ).toEqual ( jsNoSampleMerged )
  } )

  it ( "should merge the typescript template files. This is more interesting because there are multiple files", () => {
    let actual = mergeFiles ( 'someContext' ) ( tsContentSample );
    expect ( actual ).toEqual ( tsSampleMerged )
  } )
  //(minor duplicate test but focuses attention)
  it ( "should use jsonMerge on the package.json file ", () => {
    let actual: NameAnd<SourcedTemplateFileDetailsWithContent> = mergeFiles ( 'someContext' ) ( tsContentSample );
    expect ( JSON.parse ( actual[ "package.json" ].content as string ) ).toEqual ( {
      "@test@/javascript/package.json": "content",
      "@test@/typescript/package.json": "content",
      "tx": "${}"
    } )
  } )
} )

describe ( "postProcessFiles", () => {
  it ( "should post process the files if needed - simple javascript", async () => {
    const actual = await postProcessFiles ( 'someContext', fileOps, optionsWithoutSample ) ( jsNoSampleMerged );
    expect ( actual[ "package.json" ].content ).toEqual ( '{"post": "packageJson()","tx":"${}","@test@/javascript/package.json":"content"}' )
    expect ( actual.src.content[ "somefile.js" ].content ).toEqual ( '{"post": "pp","@test@/javascript/somefile.js":"content"}' )
  } )
  it ( "should post process the files if needed - more complex typescript", async () => {
    const actual = await postProcessFiles ( 'someContext', fileOps, optionsWithoutSample ) ( tsSampleMerged );
    expect ( JSON.parse ( actual[ "package.json" ].content.toString () ) ).toEqual ( {
      "post": "packageJsonSort",
      "tx": "${}",
      "@test@/javascript/package.json": "content",
      "@test@/typescript/package.json": "content"
    } )
    expect ( actual.src.content[ "somefile.js" ].content ).toEqual ( '{"post": "ppts","@test@/typescript/somefile.js":"content"}' )
  } )
} )

describe ( "saveMergedFiles", () => {
  it ( "should save the files", async () => {
    const metered = meteredFileOps ( fileOps )
    await saveMergedFiles ( 'someContext', metered, optionsWithoutSample, 'sometarget', tsSampleMerged );
    expect ( metered.savedFiles () ).toEqual ( [
      [ "sometarget/.npmrc", "{\"@test@/typescript/.npmrc\":\"content\"}" ],
      [ "sometarget/jest.config.json", "{\"@test@/typescript/jest.config.json\":\"content\"}" ],
      [ "sometarget/package.json", "{\n  \"tx\": \"${}\",\n  \"@test@/javascript/package.json\": \"content\",\n  \"@test@/typescript/package.json\": \"content\"\n}" ],
      [ "sometarget/src/justSpecInJs.js", "{\"@test@/javascript/justSpecInJs.js\":\"content\"}" ],
      [ "sometarget/src/justts.ts", "{\"@test@/typescript/justts.ts\":\"content\"}" ],
      [ "sometarget/src/somefile.js", "{\"@test@/typescript/somefile.js\":\"content\"}" ],
      [ "sometarget/tsconfig.json", "{\"@test@/typescript/tsconfig.json\":\"content\"}" ]
    ] )
  } )
} )

describe ( "copyFromTemplate", () => {

  it ( "should copy the files", async () => {
    const metered = meteredFileOps ( fileOps )
    await copyFromTemplate ( 'someContext', metered, optionsWithoutSample, "@test@/typescript", 'sometarget' );
    expect ( metered.savedFiles () ).toEqual ( [
      [ "sometarget/package.json", "{\"post\": \"packageJsonSort\",\n  \"tx\": \"${}\",\n  \"@test@/javascript/package.json\": \"content\",\n  \"@test@/typescript/package.json\": \"content\"\n}" ],
      [ "sometarget/src/somefile.js", "{\"post\": \"ppts\",\"@test@/typescript/somefile.js\":\"content\"}" ],
      [ "sometarget/src/justSpecInJs.js", "{\"@test@/javascript/justSpecInJs.js\":\"content\"}" ],
      [ "sometarget/src/justts.ts", "{\"@test@/typescript/justts.ts\":\"content\"}" ],
      [ "sometarget/.npmrc", "{\"post\": \"checkEnv(NPM_TOKEN)\",\"@test@/typescript/.npmrc\":\"content\"}" ],
      [ "sometarget/jest.config.json", "{\"@test@/typescript/jest.config.json\":\"content\"}" ],
      [ "sometarget/tsconfig.json", "{\"@test@/typescript/tsconfig.json\":\"content\"}" ]
    ] )
    expect ( fileOpsStats ( metered ) ).toEqual ( {
      "createDirCount": 7,
      "loadFileOrUrlCount": 11,
      "removeDirectoryCount": 0,
      "saveFileCount": 7
    } )
  } )
  it ( "should filter", async () => {
    const metered = meteredFileOps ( fileOps )
    await copyFromTemplate ( 'someContext', metered, { ...optionsWithoutSample, filter: name => name === 'package.json' }, "@test@/typescript", 'sometarget' );
    expect ( metered.savedFiles () ).toEqual ( [
      [ "sometarget/package.json", "{\"post\": \"packageJsonSort\",\n  \"tx\": \"${}\",\n  \"@test@/javascript/package.json\": \"content\",\n  \"@test@/typescript/package.json\": \"content\"\n}" ] ] )
    expect ( fileOpsStats ( metered ) ).toEqual ( {
      "createDirCount": 1,
      "loadFileOrUrlCount": 4,
      "removeDirectoryCount": 0,
      "saveFileCount": 1
    } )
  } )
} )


const templates = {
  javascript: "@test@/javascript",
  typescript: "@test@/typescript"
}
describe ( "findTemplateLookup", () => {
  it ( "should return a map of template names to the named file within each template (most often package.json)", async () => {
    await expect ( await findTemplateLookup (`someContext`, fileOps, optionsWithSample, templates, "package.json" ) ).toEqual ( {
      "javascript": {
        "@test@/javascript/package.json": "content",
        "post": "packageJson()",
        "tx": "${}"
      },
      "typescript": {
        "@test@/javascript/package.json": "content",
        "@test@/typescript/package.json": "content",
        "post": "packageJsonSort",
        "tx": "${}"
      }
    } )
  } )
} )


describe ( "validateTemplates", () => {
  it ( "should return no problems for welformed template", async () => {
    await expect ( await validateTemplates ( 'someContext', fileOps, optionsWithSample, {
      javascript: "@test@/javascript",
      typescript: "@test@/typescript"
    } ) ).toEqual ( [] )
  } )
  it ( "should report a list of issues for broken templates", async () => {
    await expect ( await validateTemplates ( 'someContext',fileOps, optionsWithSample, {
      javascript: "@test@/javascript",
      typescript: "@test@/typescript",
      notin: "notin",
      "#doesntparse#": "#doesntparse#",
      "nofiles": "nofiles"
    } ) ).toEqual ( [
      "someContext Error loading notin: Error: not found",
      "someContext Error loading #doesntparse#: Error: Invalid JSON for someContext. Url #doesntparse#: {not json",
      "Invalid template control file nofiles: someContext. Url nofiles.files is not an object."
    ])
  } )
} )

