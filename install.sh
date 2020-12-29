#!/usr/bin/env bash

me=install.sh

function usage(){
  echo "usage $me"
  echo "    This 'setsup' the laoban for usage by a developer. "
  echo "    This must be called from the root directory of the laoban project"
  exit 0
}

if [ $# != 0 ]; then  usage; fi

if [ ! -d ".git" ]; then echo "Must be called from the laoban root directory"; usage; exit 2; fi
if [ ! -d "code/modules/laoban" ]; then echo "Must be called from the laoban root directory"; usage; exit 2; fi

function doTheTsc(){
  dir=$1
  (
    cd $dir
    echo "...$dir"
    tsc --noEmit false --outDir dist
  )
}


cd code/modules
yarn install

echo "Now executing tsc"
doTheTsc debug
doTheTsc generations
doTheTsc validation
doTheTsc variables
doTheTsc laoban

echo

echo "You may need to execute the following
     sudo ln -s $(yarn bin)/laoban /usr/bin/laoban"

echo "To run laoban you need to be in directory that has a laoban.json or be under a directory that has a laoban.json "
echo "then run 'laoban --help' for instructions"