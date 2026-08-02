#!/bin/sh

set -eu

APP_ID="io.github.andrewkennedy.lgpicturebridge"
APP_ROOT="/media/developer/apps/usr/palm/applications/$APP_ID"
STATE_DIR="/var/lib/$APP_ID"
STARTUP_LINK="/var/lib/webosbrew/init.d/55-lg-picture-bridge"
NODE_BIN="/usr/bin/node"

case "${1:-}" in
    pair)
        pairing_payload="${2:-}"
        if [ -z "$pairing_payload" ]; then
            echo "Missing pairing payload" >&2
            exit 2
        fi
        "$NODE_BIN" "$APP_ROOT/bridge/configure.js" pair "$pairing_payload"
        mkdir -p /var/lib/webosbrew/init.d
        ln -sf "$APP_ROOT/scripts/startup.sh" "$STARTUP_LINK"
        "$APP_ROOT/scripts/startup.sh" restart
        ;;
    clear)
        "$APP_ROOT/scripts/startup.sh" stop
        "$NODE_BIN" "$APP_ROOT/bridge/configure.js" clear
        rm -f "$STATE_DIR/health.json"
        rm -f "$STARTUP_LINK"
        "$APP_ROOT/scripts/install-security.sh" remove
        ;;
    status)
        "$NODE_BIN" "$APP_ROOT/bridge/status.js"
        ;;
    test)
        "$NODE_BIN" "$APP_ROOT/bridge/test-webhook.js"
        ;;
    restart)
        "$APP_ROOT/scripts/startup.sh" restart
        ;;
    *)
        echo "Usage: setup.sh {pair BASE64_JSON|clear|status|test|restart}" >&2
        exit 2
        ;;
esac
