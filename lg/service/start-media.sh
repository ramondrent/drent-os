#!/bin/sh
export PATH=/usr/bin:/usr/sbin:/bin:/sbin
MEDIA_DIR=/media/developer/cleanframe-media
[ -f "$MEDIA_DIR/config.json" ] || exit 1
pgrep -f '[n]ode /media/developer/cleanframe-media/media-bridge.cjs' >/dev/null && exit 0
nohup /usr/bin/node "$MEDIA_DIR/media-bridge.cjs" "$MEDIA_DIR/config.json" > /tmp/cleanframe-media.log 2>&1 < /dev/null &
