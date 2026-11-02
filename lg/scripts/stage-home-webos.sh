#!/bin/sh
set -e
L=/media/developer/drent-os
[ -d "$L" ] || L=/media/developer/ramon-os
[ -d "$L" ] || L=/media/developer/cleanyourtv
S=$L/home-overlay
mkdir -p "$S"
cp -R "$L/app/." "$S/"
node "$L/stage-home.cjs" "$L/backup/home-appinfo.orig.json" "$S/appinfo.json"
# Home runs outside the root service's private configuration directory.
find "$S" -type d -exec chmod 755 {} \;
find "$S" -type f -exec chmod 644 {} \;
