import { FileOps, findFileUp, parseJson } from "@laoban/fileops";

export const courseFileName = "course.json";
export interface RawCourse {
  title?: string
  emailFile?: string
}

export interface Course {
  title: string
  emails: string[]
}

export async function convertCourse ( fileOps: FileOps, rawCourse: RawCourse ): Promise<Course> {
  const emailsString = await fileOps.loadFileOrUrl ( rawCourse.emailFile ? rawCourse.emailFile : "emails.txt" )
  const emails = emailsString.split ( "\n" )
  const title = rawCourse.title || "Untitled"
  return { title, emails }
}
export function findCourseFile ( fileOps: FileOps, startDir: string ): Promise<string> {
  return findFileUp ( startDir, s => fileOps.isFile ( fileOps.join ( startDir, courseFileName ) ) )
}

export async function loadAndConvertCourse ( fileOps: FileOps, startDir: string ): Promise<Course> {
  const fileName = await findCourseFile ( fileOps, startDir )
  let rawFileDetails = await fileOps.loadFileOrUrl ( courseFileName );
  const rawCourse = parseJson<RawCourse> ( () => courseFileName ) ( rawFileDetails )
  return convertCourse ( fileOps, rawCourse );
}