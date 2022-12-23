# Laoban and Yarn

Firstly you need to understand [workspaces](https://yarnpkg.com/features/workspaces). The 
link describes how to set them up.

They are fantastic and allow us to edit code in one project and have it 
immediately available in another without actually having to publish anywhere. This
is critical for fast development.

Unfortunately yarn workspaces don't yet handle all of our usecases. They 
are an essential component to working with mono-repos in the javascript world
but don't make it easy to do many of the tasks we want to do.

Laoban fills in the gaps. As workspaces improve, there is everychance laoban will 
become redundant, but we are some time away from that happening

Loaban works seamlessly with `yarn`. The [templates](TEMPLATES.md) allow us
to have common properties in our projects and manage them centrally. The 
`version.txt` and `laoban update`  allows us to manage our version numbers and 
`laoban publish` will push the projects marked for publishing to `npmjs`. `laoban status`
allows us to get a grasp of what is going on across our projects.

## Setting up
Following the instructions for setting up  [workspaces](https://yarnpkg.com/features/workspaces). 

### Summary
(default actions: most things are configurable)
* Have a `package.json` in the root directory that defines the workspaces
* This is the natural place to put `laoban.json`
* In each child project add a `project.details.json` and configure it with the name/description and links.
* Use `laoban update` to create the `package.json`
* Type `yarn` to install everything and get the workspaces setup
* `laoban tsc -asl` will compile everything in the right order
