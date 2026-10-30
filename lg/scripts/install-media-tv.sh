#!/bin/sh
set -eu
L=/media/developer/ramon-os
M=/media/developer/cleanframe-media
B=$L/backup/before-plex-shelf
[ -f "$L/app/main.js" ] && [ -f "$L/stage-home.sh" ]
[ ! -e "$B" ] || { echo 'Backup already exists; refusing to replace it'; exit 1; }
mkdir -p "$B" "$M"
chmod 700 "$M"
for file in index.html main.js style.css; do cp -p "$L/app/$file" "$B/$file"; done
cp /tmp/cleanframe-media-stage/media-bridge.cjs "$M/media-bridge.cjs"
cp /tmp/cleanframe-media-stage/start-media.sh "$M/start-media.sh"
cp /tmp/cleanframe-media-stage/config.json "$M/config.json"
chmod 600 "$M/config.json"
chmod 755 "$M/start-media.sh"
for file in index.html main.js style.css continue.js; do cp "/tmp/cleanframe-media-stage/$file" "$L/app/$file"; done
cat > "$M/restore.sh" <<'RESTORE'
#!/bin/sh
set -eu
L=/media/developer/ramon-os
for file in index.html main.js style.css; do cp "$L/backup/before-plex-shelf/$file" "$L/app/$file"; done
sh "$L/stage-home.sh"
rm -f /var/lib/webosbrew/init.d/15-cleanframe-media
for pid in $(pgrep -f '[n]ode /media/developer/cleanframe-media/media-bridge.cjs'); do kill "$pid"; done
sh "$L/reload-home.sh"
RESTORE
chmod 700 "$M/restore.sh"
ln -sf "$M/start-media.sh" /var/lib/webosbrew/init.d/15-cleanframe-media
sh "$M/start-media.sh"
chmod 644 "$L/app/continue.js"
sh "$L/stage-home.sh"
chmod 644 "$L/home-overlay/continue.js"
echo 'Media bridge and frontend staged; Home has not been reloaded.'
