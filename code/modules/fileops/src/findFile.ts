import { allButLastSegment } from "@laoban/utils";

export async function findFileUp (  directory: string , predicate: (s: string) => Promise<boolean>): Promise<string | undefined> {
  async function find ( dir: string ) {
    if (await predicate(dir)) return dir
    let parent = allButLastSegment(dir);
    if (parent === '') return undefined
    return find ( parent)
  }
  return find ( directory )
}