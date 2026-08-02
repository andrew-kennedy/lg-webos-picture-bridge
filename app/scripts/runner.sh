#!/bin/sh

APP_ID="io.github.andrewkennedy.lgpicturebridge"
STATE_DIR="/var/lib/$APP_ID"
SERVICE_ID="$APP_ID.service"
SERVICE_ROOT="/media/developer/apps/usr/palm/services/$SERVICE_ID"
HOMEBREW_RUNNER="/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/run-js-service"
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
    if [ ! -x "$HOMEBREW_RUNNER" ]; then
        echo "Homebrew JS-service runner was not found: $HOMEBREW_RUNNER"
        sleep 30
        continue
    fi
    if [ ! -f "$SERVICE_ROOT/services.json" ]; then
        echo "Registered Luna service was not installed: $SERVICE_ROOT"
        sleep 30
        continue
    fi
    "$HOMEBREW_RUNNER" -k -n "$SERVICE_ROOT" &
    bridge_pid=$!
    wait "$bridge_pid" 2>/dev/null || true
    bridge_pid=""
    if [ "$stopping" -eq 0 ] && [ -f "$STATE_DIR/config.json" ]; then
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) Bridge process exited; restarting in 5 seconds"
        sleep 5
    fi
done
