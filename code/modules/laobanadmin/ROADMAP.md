
# Issues

## We conflated the inits... 

The templates should be different to the laoban type. At the moment they are the same. This it's hard to explain `-t` and `-l`. 
(It's hard to explain because the model is wrong)

Probably the -t should be derived... From the list of specified -l.

# New features

## laobin-admin init uses code to decide what to take from the package.json: change to variables
This could easily be done by variables but at the moment we load the
file from the init and then parse it. We would need to change this to dererence the variables before parsing it.

## create a .templates file for a directory

So to make a template just 'do it...'.
Would be cool if can do parent and then work out the minimum to add...

## create the versions.txt file --Done


## Create `.package.test.json` with `--dryrun`

Because this is actually what matters

## Run laoban update after the init (this might be the same as above) 

## Auto detect git repo 

Also consider what to do if using git submodules etc... i.e. if there are child gits...
This is true for normal laoban as well... so maybe handle it there... 

## `laoban-admin newchild -t typescript -d directory`

This should make a new child project in the current directory (or in -d). 
And run laoban update on it...

## Scripts

Do scripts the same way as bins/extraDeps/extraDevDeps

## Report what has changed

Compare the package.json before and after. Report the differences...

