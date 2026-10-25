#!/bin/sh
set -e
L=/media/developer/cleanyourtv
S=$L/home-overlay
mkdir -p "$S"
cp -R "$L/app/." "$S/"
node "$L/jtool.js" stage "$L/backup/home-appinfo.orig.json" "$S/appinfo.json"
