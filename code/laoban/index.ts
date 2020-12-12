#!/usr/bin/env node
import {makeStandardCli} from "./src/laoban";

makeStandardCli(process.stdout).start(process.argv)
