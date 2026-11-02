#!/bin/sh
set -eu
L=/media/developer/drent-os
[ -d "$L" ] || L=/media/developer/ramon-os
sh "$L/undo-home.sh"
echo 'Stock LG Home restored'
