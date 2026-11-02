#!/bin/sh
# Unmount DrentOS Home overlay and restore stock LG Home.
export PATH=/usr/bin:/usr/sbin:/bin:/sbin:$PATH
H=/usr/palm/applications/com.webos.app.home
if grep -q " $H " /proc/mounts; then
  for m in $(awk '$2 ~ /applications\/com\.webos\.app\.home$/ {print $2}' /proc/mounts | sort -r); do
    umount "$m" 2>/dev/null || umount -l "$m" 2>/dev/null
  done
  pkill -f "[a]pp-id=com.webos.app.home" 2>/dev/null || true
  systemctl restart sam
fi
