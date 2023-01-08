0.2.14: Added some tests for variables
0.2.15: The directory of a command in .session now includes the args
0.2.16: removed the monitors (press a button when it's running) because they were rarely used and not actually useful!
0.2.17 Significantly improved the error reporting when there are loops in the project structure 
0.2.18 Removed validation bug (false was not being treated as a boolean)

0.3.0 Can now have parents
0.3.1 Now caching parents
0.3.2 Can have remote templates now
0.3.3 'laoban init' makes a simpler laoban.json 
0.3.4 No significant functionality change: cleaning up how things work
0.3.5 added --cachestats
0.3.6 added --clearcache
0.3.7 variables can now be of form${var:object:indent4:comma} which allows objects to be merged in templates
0.3.8 fixed issues with guards introduced by 0.3.7
0.3.12 package.json is now 'nothing special'. 
0.3.13 we have properties in laoban.json that can be accessed by package.json (project wide things like 'license' and 'repository')
0.3.14 Restored the 'old default update' mechanism for legacy laoban installations
0.3.15 Changed --clearcache to a command and improved error reporting/debugging for update
0.3.16 Post processors added for update. Makes it much easier to reuse existing templates, and the user experience around files needing environment variables (like NPM_TOKEN) is much better
0.3.17 properties can be defined in parent laoban.jsons and merged in
0.3.24 Added laoban-admin init
0.3.29 'laoban-admin init --types typescript javascript' will detect the appropriate template
0.3.30 cleaned up parameters for 'laoban-admin init'
0.3.32 adding 'laoban-admin projects' to list all projects
0.3.33 `npm i -g @laoban/admin@latest` also installs laoban

0.4.1 No longer properly support the templateDir
0.4.2 Now suggest a version number with `laoban-admin init`
0.4.9 Can now have version numbers update with update using '--minor', '--major' or '--setVersion'

1.0.2 Now using package.details.json instead of project.details.json. This is a breaking change.
1.0.4 laoban-admin now picks up keywords from the package.json
1.0.7 Guards can now be used for commands as well as scripts
1.0.8 tsc renamed as compile, nicer --dryrun output
