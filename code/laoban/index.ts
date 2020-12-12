#!/usr/bin/env node
import {makeStandardCli} from "./src/laoban";

// console.log('start')
makeStandardCli(process.stdout).start(process.argv).then(() => {
    // console.log('finished')
    process.exit(0)//because we have changed this to be a 'listen to stdin' which keeps the process alive... so we need to manually exit

})
