#!/bin/sh
# Older native-Home TVs may boot into HDMI and use com.webos.app.fullhome.
set -eu
export PATH=/usr/bin:/usr/sbin:/bin:/sbin:$PATH
L=/media/developer/ramon-os
F=/usr/bin/com.webos.app.fullhome
if [ ! -e "$L/DISABLE" ] && [ -f "$F" ] && [ -f "$L/home-full-webos-native.sh" ]; then
  if ! grep -q " $F " /proc/mounts; then
    mount --bind "$L/home-full-webos-native.sh" "$F"
    touch /tmp/ramon-os-fullhome
    for p in $(pgrep -f "^$F"); do kill "$p" 2>/dev/null || true; done
  fi
fi
sh "$L/start-home.sh"
