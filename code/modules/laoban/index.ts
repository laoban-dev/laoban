#!/usr/bin/env node
import {makeStandardCli} from "./src/laoban";

// console.log('start', process.argv)
try {
    makeStandardCli(process.stdout).start(process.argv).then(() => {
        // console.log('finished')
        process.setMaxListeners(20) // because commander adds many listeners: at least one per option, and we have more than 10 options
        process.exit(0)//because we have changed this to be a 'listen to stdin' which keeps the process alive... so we need to manually exit

    })
} catch (e) {
    console.error(e.message)
}
