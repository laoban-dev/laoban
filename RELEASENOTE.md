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