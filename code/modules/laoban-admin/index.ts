import { LaobanAdmin } from "./src/laoban-admin";
import { fileOps } from "@phil-rice/files";


try {
  const admin = new LaobanAdmin ( fileOps, process.cwd (), process.argv )
  admin.start ()
} catch ( e ) {
  console.error ( e.message )
}
