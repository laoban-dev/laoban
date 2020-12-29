#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var laoban_1 = require("./src/laoban");
// console.log('start', process.argv)
laoban_1.makeStandardCli(process.stdout).start(process.argv).then(function () {
    // console.log('finished')
    process.setMaxListeners(20); // because commander adds many listeners: at least one per option, and we have more than 10 options
    process.exit(0); //because we have changed this to be a 'listen to stdin' which keeps the process alive... so we need to manually exit
});
