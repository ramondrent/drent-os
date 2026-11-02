#!/bin/sh
# Installed as undo-home.sh on native-Home TVs, with the original script saved alongside.
export PATH=/usr/bin:/usr/sbin:/bin:/sbin:$PATH
L=/media/developer/drent-os
[ -d "$L" ] || L=/media/developer/ramon-os
[ -d "$L" ] || L=/media/developer/cleanyourtv
F=/usr/bin/com.webos.app.fullhome
if [ -f /tmp/drent-os-fullhome ] || [ -f /tmp/ramon-os-fullhome ]; then
  umount "$F" || exit 1
  rm -f /tmp/drent-os-fullhome /tmp/ramon-os-fullhome
  for p in $(pgrep -f "^/bin/sh $F"); do kill "$p" 2>/dev/null; done
  pkill -f '[l]una-send -i -a com.webos.app.fullhome' 2>/dev/null
fi
exec sh "$L/undo-home-upstream.sh" "$@"
