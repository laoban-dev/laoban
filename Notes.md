
In order to set up the link you can use
```
sudo ln -s  /mnt/c/git/laoban/code/laoban/dist/index.js /usr/bin/laoban
```


Try doing an install when there are no ts files... and this gives us a problem
Nasty error messages


Check the -ds options.. not looking great at the moment

when loaban and a project has 'publish: false' it doesn't validate


Need to be able to quickly set up in line with yarn workspaces
Not sure about tsc subprojects..


trying run laoban -p with laoban run 'js:process.cwd()' -p /co
and had reference error1

# TODO:
* Let's have laoban generate a default laoban.json and default templates.
    * It would be good to have that as a skeleton story and have other people able to add their skeletons
* add the generation code in: currently using old generation code

Also check if works without template


