#!/bin/sh
# Reload the Ramon OS Home renderer in WebAppMgr without restarting sam.
export PATH=/usr/bin:/usr/sbin:/bin:/sbin:$PATH
if pgrep -f "[a]pp-id=com.webos.app.home" >/dev/null; then
  pkill -f "[a]pp-id=com.webos.app.home"
  sleep 2
fi
power_state=$(luna-send -n 1 -w 3000 -f luna://com.webos.service.tvpower/power/getPowerState '{}' </dev/null 2>/dev/null | sed -n 's/.*"state": *"\([^"]*\)".*/\1/p' | head -n 1)
if [ "$power_state" != "Active Standby" ]; then
  luna-send -n 1 -w 10000 -f luna://com.webos.applicationManager/launch '{"id":"com.webos.app.home"}' </dev/null >/dev/null 2>&1
fi
