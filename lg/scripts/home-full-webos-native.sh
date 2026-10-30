#!/bin/sh
# The CX's physical Home key can launch fullhome regardless of boot Home mode.
# Keep its native identity and forward its launch/relaunch events to our Home.
export PATH=/usr/bin:/usr/sbin:/bin:/sbin:$PATH
show() {
  luna-send -n 1 -w 10000 luna://com.webos.applicationManager/launch '{"id":"com.webos.app.home"}' </dev/null >/dev/null
}
show
luna-send -i -a com.webos.app.fullhome luna://com.webos.applicationManager/registerApp '{}' </dev/null | while read -r line; do
  case "$line" in
    *'"event"'*relaunch*) show ;;
    *'"event"'*close*) kill $$ 2>/dev/null; exit 0 ;;
  esac
done
