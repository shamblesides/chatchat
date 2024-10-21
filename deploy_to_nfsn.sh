#!/bin/bash

# This script just helps me deploy ChatChat's backend to my
# current host, nearlyfreespeech.net.
# It may or may not be of any use to you!

set -e

REMOTE=`cat .remote-host`

echo 'Running rsync'
rsync -arzP --delete --exclude=src/graphics --exclude=src/sounds package* src $REMOTE:/home/public

echo 'Running npm install'
ssh $REMOTE "cd /home/public && npm install --omit=dev"

echo "SIGKILL daemon process"
ssh $REMOTE nfsn signal-daemon runserver KILL
