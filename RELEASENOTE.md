* 0.2.14: Added some tests for variables
* 0.2.15: The directory of a command in .session now includes the args
* 0.2.16: removed the monitors (press a button when it's running) because they were rarely used and not actually useful!
* 0.2.17 Significantly improved the error reporting when there are loops in the project structure
* 0.2.18 Removed validation bug (false was not being treated as a boolean)


* 0.3.0 Can now have parents
* 0.3.1 Now caching parents
* 0.3.2 Can have remote templates now
* 0.3.3 'laoban init' makes a simpler laoban.json
* 0.3.4 No significant functionality change: cleaning up how things work
* 0.3.5 added --cachestats
* 0.3.6 added --clearcache
* 0.3.7 variables can now be of form${var:object:indent4:comma} which allows objects to be merged in templates
* 0.3.8 fixed issues with guards introduced by 0.3.7
* 0.3.12 package.json is now 'nothing special'.
* 0.3.13 we have properties in laoban.json that can be accessed by package.json (project wide things like 'license'
  and 'repository')
* 0.3.14 Restored the 'old default update' mechanism for legacy laoban installations
* 0.3.15 Changed --clearcache to a command and improved error reporting/debugging for update
* 0.3.16 Post processors added for update. Makes it much easier to reuse existing templates, and the user experience
  around files needing environment variables (like NPM_TOKEN) is much better
* 0.3.17 properties can be defined in parent laoban.jsons and merged in
* 0.3.24 Added laoban-admin init
* 0.3.29 'laoban-admin init --types typescript javascript' will detect the appropriate template
* 0.3.30 cleaned up parameters for 'laoban-admin init'
* 0.3.32 adding 'laoban-admin projects' to list all projects
* 0.3.33 `npm i -g @laoban/admin@latest` also installs laoban


* 0.4.1 No longer properly support the templateDir
* 0.4.2 Now suggest a version number with `laoban-admin init`
* 0.4.9 Can now have version numbers update with update using '--minor', '--major' or '--setVersion'


* 1.0.2 Now using package.details.json instead of project.details.json. This is a breaking change.
* 1.0.4 laoban-admin now picks up keywords from the package.json
* 1.0.7 Guards can now be used for commands as well as scripts
* 1.0.8 tsc renamed as compile, nicer --dryrun output
* 1.0.11 Added `laoban-admin newpackage` to create a new package, and laoban config --all to show scripts
* 1.0.12 bugfix caused by capitalisation in the package name
* 1.0.17 Added `laoban-admin newtemplate` to create a new template
* 1.0.18 Licenses added to the files
* 1.0.22 adding `laoban-admin makeintotemplate` to turn the current directory into a template
* 1.0.23 adding `laoban-admin makeintotemplate` now updates `laoban.json`
* 1.0.26 adding `laoban-admin updatealltemplates`
* 1.1.0 removed laoban-admin as a separate project, and now it is part of laoban
* 1.1.9 added file commands to allow os independent file manipulation in scripts
* 1.1.10 changed the log names to be shorted and easier to read. Also fixed a bug around directory names ending in '.'
* 1.2.0 change `laoban-admin` into `laoban admin` (note the lack of a '-)
* 1.2.1 moved cleancache and profile to laoban admin
* 1.2.2 added `--ignoreGuards` while allowed the removal of scripts that were duplicates of commands except for the
  guards
* 1.2.3 moved `laoban config` and `loaban validate` to `laoban admin`, bug fixes and cleanup of the code
* 1.2.5 added `laoban admin templates` to list all templates
* 1.2.10 `laoban status` now has an exit code of 1 if there are any errors
* 1.2.11 `laoban admin updatetemplate` now updates the template based on package.json. For example if the typescript
  version was updated in the package.json...
* 1.2.12 `laoban admin analyzepackage` now shows what would happen if the templates suggested were adopted
* 1.2.16 `laoban admin analyze` is the new name of the `analyzepackage`. A lot of polish added to `init` and `analyze`
* 1.2.19 `init` and `analyze` now ignore template directories
* 1.2.21 `showShell` now a script option
* 1.2.22 adding `defaultEnv` to 'laoban.json' to allow the default environment to be set
* 1.2.24 `laoban admin init` now updates .gitignore
* 1.2.25 `laoban admin init` now updates .gitignore even if no `--force`
* 1.2.27 file: commands now include mkdir and file:tail(file,lines) where lines defaults to 10
* 1.2.28 Logs in the directory are just the last command. The `laoban log` uses `noLogOverwrite:true`
* 1.2.31 Scripts that 'fail' now communicate that better
* 1.2.40 Templates can now have samples. So when `laoban admin newpackage` is run, the samples are copied into the
  project (as long as there is no existing package.json)

* 1.3.0 Breaking change to package.details.json. Now has packageJson section and everything in it is merged into
  packageJson. This is far more extensible and most importantly understandable
* 1.3.2 packageJson(xx,xx) in templates'
* 1.4.7 New template structure.
* 1.4.8 String functions such as |toLowerCase, |toTitleCase and |toSnakeCase| added
* 1.4.9 Added |default(x) to allow default values to be set
* 1.4.11 Added |toPackage and allowed filenames in templates to have variables
* 1.4.14 Heart and lung transplant. XML manipulation now in the codebase