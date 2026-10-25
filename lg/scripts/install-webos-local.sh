#!/bin/sh
set -eu
L=/media/developer/cleanyourtv
B=$L/backup/before-cleanframe
[ -f "$L/app/index.html" ] && [ -f "$L/stage-home.sh" ]
[ ! -e "$B" ] || { echo 'Existing recovery backup found; refusing to overwrite'; exit 1; }
mkdir -p "$B"
cp -p "$L/stage-home.sh" "$B/stage-home.sh"
cp -p "$L/config.json" "$B/config.json"
tar -czf "$B/launcher.tgz" -C "$L" app home-overlay
mkdir -p "$L/cleanframe-staging"
tar -xzf /tmp/lg-cleanframe.tgz -C "$L/cleanframe-staging"
[ -f "$L/cleanframe-staging/index.html" ] && [ -f "$L/cleanframe-staging/assets/wallpapers/misty.jpg" ]
# Keep the version metadata of the backend's launcher separate from the port's identity.
cp "$L/app/version.json" "$L/cleanframe-staging/version.json"
mv "$L/app" "$B/app-original"
mv "$L/cleanframe-staging" "$L/app"
cp /tmp/stage-home-webos.sh "$L/stage-home.sh"
chmod -R go-w "$L/app"
chmod 755 "$L/stage-home.sh"
sh "$L/stage-home.sh"
sh "$L/reload-home.sh"
echo 'CleanFrame staged and Home reloaded'
