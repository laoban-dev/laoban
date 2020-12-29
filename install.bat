cd code/modules
cmd /c yarn install
cd debug
echo "debug"
cmd /c tsc
cd ../generations
echo "generations"
cmd /c tsc
cd ../validation
echo "validation"
cmd /c tsc
cd ../variables
echo "variables"
cmd /c tsc
cd ../laoban
echo "laoban"
cmd /c tsc

mkl
echo "You may need to execute the following"
     sudo ln -s $(yarn bin)/laoban /usr/bin/laoban"

echo "To run laoban you need to be in directory that has a laoban.json or be under a directory that has a laoban.json "
echo "then run 'laoban --help' for instructions"
pause "Press any key"