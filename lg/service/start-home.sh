#!/bin/sh
# Ramon OS boot hook for LG webOS (/var/lib/webosbrew/init.d/10-ramon-os-home).
# Starts the local loopback bridge, bind-mounts Ramon OS over LG's Home slot in RAM,
# and preserves the preloaded HDMI input across Active Standby -> Suspend -> CEC wake.
export PATH=/usr/bin:/usr/sbin:/bin:/sbin:$PATH
L=/media/developer/ramon-os
H=/usr/palm/applications/com.webos.app.home

pgrep -f '[n]ode /media/developer/ramon-os/tv-bridge.cjs' >/dev/null || (
  nohup /usr/bin/node "$L/tv-bridge.cjs" >/tmp/ramon-os-bridge.log 2>&1 </dev/null &
)

[ -e "$L/DISABLE" ] && exit 0

sh "$L/stage-home.sh"

if grep -q " $H " /proc/mounts; then
  [ "${1:-}" = keep ] && exit 0
  sh "$L/reload-home.sh"
  exit 0
fi

power_state=$(luna-send -n 1 -w 3000 -f luna://com.webos.service.tvpower/power/getPowerState '{}' </dev/null 2>/dev/null | sed -n 's/.*"state": *"\([^"]*\)".*/\1/p' | head -n 1)
prev_fg=$(luna-send -n 1 -w 3000 -f luna://com.webos.applicationManager/getForegroundAppInfo '{}' </dev/null 2>/dev/null | sed -n 's/.*"appId": *"\([^"]*\)".*/\1/p' | head -n 1)
last_app=$(sed -n 's/.*"lastAppId": *"\([^"]*\)".*/\1/p' /var/luna/preferences/bootd_last_foreground_app_id.json 2>/dev/null | head -n 1)

mount --bind "$L/home-overlay" "$H" || exit 1
systemctl restart sam

(
  for i in $(seq 1 60); do
    systemctl is-active sam >/dev/null 2>&1 && break
    sleep 1
  done
  if [ -d /tmp/checkpoint ] && pidof sam >/dev/null 2>&1; then
    pidof sam > /tmp/checkpoint/manager_pid 2>/dev/null || true
  fi
  sleep 4
  target_app=""
  if [ "$power_state" = "Active Standby" ]; then
    # During QuickStart+ standby boot, inputcommon (HDMI) must be restored into RAM before Suspend.
    # Never leave com.webos.app.home in the foreground during Active Standby.
    case "$prev_fg" in
      com.webos.app.hdmi*|com.webos.app.livetv) target_app="$prev_fg" ;;
      *)
        case "$last_app" in
          com.webos.app.hdmi*|com.webos.app.livetv) target_app="$last_app" ;;
          *) target_app="com.webos.app.hdmi1" ;;
        esac
        ;;
    esac
    luna-send -n 1 -w 10000 -f luna://com.webos.applicationManager/launch "{\"id\":\"$target_app\"}" </dev/null >/dev/null 2>&1
  else
    now_fg=$(luna-send -n 1 -w 5000 -f luna://com.webos.applicationManager/getForegroundAppInfo '{}' </dev/null 2>/dev/null | sed -n 's/.*"appId": *"\([^"]*\)".*/\1/p' | head -n 1)
    if [ -n "$prev_fg" ] && [ "$prev_fg" != "com.webos.app.home" ]; then
      target_app="$prev_fg"
    elif [ -z "$now_fg" ] || [ "$now_fg" = "com.webos.app.home" ]; then
      target_app="com.webos.app.home"
    fi
    if [ "$target_app" = "com.webos.app.home" ]; then
      pkill -f "[a]pp-id=com.webos.app.home" 2>/dev/null || true
      sleep 1
    fi
    if [ -n "$target_app" ]; then
      luna-send -n 1 -w 10000 -f luna://com.webos.applicationManager/launch "{\"id\":\"$target_app\"}" </dev/null >/dev/null 2>&1
    fi
  fi
) </dev/null >/dev/null 2>&1 &
