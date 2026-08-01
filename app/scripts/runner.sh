#!/bin/sh

APP_ID="io.github.andrewkennedy.lgpicturebridge"
APP_ROOT="/media/developer/apps/usr/palm/applications/$APP_ID"
STATE_DIR="/var/lib/$APP_ID"
NODE_BIN="/usr/bin/node"
bridge_pid=""
stopping=0

stop_child() {
    stopping=1
    if [ -n "$bridge_pid" ]; then
        kill "$bridge_pid" 2>/dev/null || true
        wait "$bridge_pid" 2>/dev/null || true
    fi
    exit 0
}

trap stop_child TERM INT HUP

while [ "$stopping" -eq 0 ] && [ -f "$STATE_DIR/config.json" ]; do
    "$NODE_BIN" "$APP_ROOT/bridge/bridge.js" &
    bridge_pid=$!
    wait "$bridge_pid" 2>/dev/null || true
    bridge_pid=""
    if [ "$stopping" -eq 0 ] && [ -f "$STATE_DIR/config.json" ]; then
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Bridge process exited; restarting in 5 seconds"
        sleep 5
    fi
done
