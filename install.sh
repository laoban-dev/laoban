#!/usr/bin/env bash

cd code
yarn install
echo "You may need to execute the following
     sudo ln -s $(yarn bin)/laoban /usr/bin/laoban"

echo "To run laoban you need to be in directory that has a laoban.json or be under a directory that has a laoban.json "
echo "then run 'laoban --help' for instructions"