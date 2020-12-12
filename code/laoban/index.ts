#!/usr/bin/env node
import {Cli, executeGenerations} from "./src/laoban";
import {abortWithReportIfAnyIssues, loadConfigOrIssues, loadLoabanJsonAndValidate} from "./src/configProcessor";
import {findLaoban} from "./src/Files";

// console.log(process.argv)
let laoban = findLaoban(process.cwd())
let configAndIssues = loadConfigOrIssues(process.stdout, loadLoabanJsonAndValidate)(laoban);

let cli = new Cli(configAndIssues, executeGenerations, abortWithReportIfAnyIssues);
cli.start(process.argv)
