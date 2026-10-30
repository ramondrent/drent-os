#!/bin/sh
# Installed as undo-home.sh on native-Home TVs, with the original script saved alongside.
export PATH=/usr/bin:/usr/sbin:/bin:/sbin:$PATH
L=/media/developer/ramon-os
F=/usr/bin/com.webos.app.fullhome
if [ -f /tmp/ramon-os-fullhome ]; then
  umount "$F" || exit 1
  rm /tmp/ramon-os-fullhome
  for p in $(pgrep -f "^/bin/sh $F"); do kill "$p" 2>/dev/null; done
  pkill -f '[l]una-send -i -a com.webos.app.fullhome' 2>/dev/null
fi
exec sh "$L/undo-home-upstream.sh" "$@"
