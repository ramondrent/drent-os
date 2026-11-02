#!/bin/sh
set -eu
L=/media/developer/drent-os
OLD=/media/developer/cleanyourtv
STAGE=${STAGE:-/tmp/drent-os-stage}

[ -f "$STAGE/app/index.html" ]
[ -f "$STAGE/service/tv-bridge.cjs" ]
[ -f "$STAGE/service/stage-home.cjs" ]
[ -f "$STAGE/service/start-home.sh" ]
[ -f "$STAGE/service/reload-home.sh" ]
[ -f "$STAGE/service/undo-home.sh" ]
[ -f "$STAGE/scripts/stage-home-webos.sh" ]

mkdir -p "$L/backup" "$L/app" "$L/home-overlay"

# 1. Preserve original LG Home appinfo.json
if [ ! -f "$L/backup/home-appinfo.orig.json" ]; then
  if [ -f "$OLD/backup/home-appinfo.orig.json" ]; then
    cp -p "$OLD/backup/home-appinfo.orig.json" "$L/backup/home-appinfo.orig.json"
  else
    cp -p /usr/palm/applications/com.webos.app.home/appinfo.json "$L/backup/home-appinfo.orig.json"
  fi
fi

# 2. Archive existing CleanYourTV directory once before removal
if [ -d "$OLD" ] && [ ! -f "$L/backup/cleanyourtv-archive.tgz" ]; then
  tar -czf "$L/backup/cleanyourtv-archive.tgz" -C /media/developer cleanyourtv
fi

# 3. Install DrentOS frontend & standalone service scripts
rm -rf "$L/app.next"
mkdir -p "$L/app.next"
cp -R "$STAGE/app/." "$L/app.next/"
if [ -f "$OLD/app/continue.js" ] && [ ! -f "$L/app.next/continue.js" ]; then
  cp -p "$OLD/app/continue.js" "$L/app.next/continue.js"
fi
rm -rf "$L/app.prev"
if [ -d "$L/app" ]; then
  mv "$L/app" "$L/app.prev"
fi
mv "$L/app.next" "$L/app"
rm -rf "$L/app.prev"

cp "$STAGE/service/tv-bridge.cjs" "$L/tv-bridge.cjs"
cp "$STAGE/service/stage-home.cjs" "$L/stage-home.cjs"
cp "$STAGE/service/start-home.sh" "$L/start-home.sh"
cp "$STAGE/service/reload-home.sh" "$L/reload-home.sh"
cp "$STAGE/service/undo-home.sh" "$L/undo-home.sh"
cp "$STAGE/scripts/stage-home-webos.sh" "$L/stage-home.sh"
if [ -f "$STAGE/version.json" ]; then
  cp "$STAGE/version.json" "$L/version.json"
  chmod 644 "$L/version.json"
fi

chmod -R go-w "$L/app"
chmod 644 "$L/tv-bridge.cjs" "$L/stage-home.cjs"
chmod 755 "$L/start-home.sh" "$L/reload-home.sh" "$L/undo-home.sh" "$L/stage-home.sh"

# 4. Stage home-overlay
sh "$L/stage-home.sh"

# 5. Re-bind /usr/palm/applications/com.webos.app.home to DrentOS overlay
if grep -q ' /usr/palm/applications/com.webos.app.home ' /proc/mounts; then
  umount -l /usr/palm/applications/com.webos.app.home 2>/dev/null || true
fi
mount --bind "$L/home-overlay" /usr/palm/applications/com.webos.app.home

# 6. Replace CleanYourTV init hooks and helper daemon with DrentOS
rm -f /var/lib/webosbrew/init.d/10-cleanyourtv-home
rm -f /var/lib/webosbrew/init.d/15-cleanyourtv-debloat
rm -f /var/lib/webosbrew/init.d/10-ramon-os-home
ln -sf "$L/start-home.sh" /var/lib/webosbrew/init.d/10-drent-os-home

for p in $(pgrep -f '[n]ode /media/developer/cleanyourtv/helper.js' || true); do
  kill "$p" 2>/dev/null || true
done
for p in $(pgrep -f '[n]ode /media/developer/.*/tv-bridge.cjs' || true); do
  kill "$p" 2>/dev/null || true
done
nohup node "$L/tv-bridge.cjs" >/tmp/drent-os-bridge.log 2>&1 &

# 7. Remove CleanYourTV packages, input hooks, and directory
for app_id in com.cleanyourtv.manager com.cleanyourtv.picker com.cleanyourtv.notify; do
  luna-send -n 1 -w 5000 -f luna://com.webos.appInstallService/dev/remove "{\"id\":\"$app_id\"}" </dev/null >/dev/null 2>&1 || true
done
rm -rf /media/developer/apps/usr/palm/applications/com.cleanyourtv.manager
rm -rf /media/developer/apps/usr/palm/applications/com.cleanyourtv.picker
rm -rf /media/developer/apps/usr/palm/applications/com.cleanyourtv.notify
rm -rf /media/developer/apps/usr/palm/services/com.cleanyourtv.service
rm -rf /var/palm/ls2-dev/services/prv/com.cleanyourtv.*
rm -rf /var/palm/ls2-dev/services/pub/com.cleanyourtv.*
rm -rf /var/palm/ls2-dev/roles/prv/com.cleanyourtv.*
rm -rf /var/palm/ls2-dev/roles/pub/com.cleanyourtv.*
rm -rf "$OLD"

sh "$L/reload-home.sh"
echo 'DrentOS installed at /media/developer/drent-os and CleanYourTV removed'
