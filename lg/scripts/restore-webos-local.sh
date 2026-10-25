#!/bin/sh
set -eu
L=/media/developer/cleanyourtv
B=$L/backup/before-cleanframe
[ -f "$B/launcher.tgz" ] && [ -f "$B/stage-home.sh" ]
# Preserve the port and restore the previous app directory exactly.
if [ -f "$L/app/device.js" ]; then
  saved=$(mktemp -d "$L/backup/cleanframe-disabled.XXXXXX")
  mv "$L/app" "$saved/app"
fi
# Restore the overlay in place because it is a live bind-mount source.
tar -xzf "$B/launcher.tgz" -C "$L"
cp -p "$B/stage-home.sh" "$L/stage-home.sh"
sh "$L/reload-home.sh"
echo 'Previous CleanYourTV Home restored'
