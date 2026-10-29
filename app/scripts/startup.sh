#!/bin/sh

APP_ID="io.github.andrewkennedy.lgpicturebridge"
APP_ROOT="/media/developer/apps/usr/palm/applications/$APP_ID"
STATE_DIR="/var/lib/$APP_ID"
RUNTIME_DIR="/tmp/$APP_ID"
PID_FILE="$RUNTIME_DIR/bridge.pid"
LEGACY_PID_FILE="$STATE_DIR/bridge.pid"
LOG_FILE="$RUNTIME_DIR/bridge.log"
NODE_BIN="/usr/bin/node"

is_running() {
    command_line=""
    active_pid_file="$PID_FILE"
    # An upgrade must still be able to stop the pre-0.10 supervisor.
    [ -f "$active_pid_file" ] || active_pid_file="$LEGACY_PID_FILE"
    [ -f "$active_pid_file" ] || return 1
    bridge_pid="$(sed -n '1p' "$active_pid_file" 2>/dev/null)"
    case "$bridge_pid" in
        ''|*[!0-9]*) return 1 ;;
    esac
    kill -0 "$bridge_pid" 2>/dev/null || return 1
    [ -r "/proc/$bridge_pid/cmdline" ] || return 1
    command_line="$(tr '\000' ' ' <"/proc/$bridge_pid/cmdline" 2>/dev/null)"
    case "$command_line" in
        *"$APP_ROOT/scripts/runner.sh"*) return 0 ;;
        *) return 1 ;;
    esac
}

start_bridge() {
    if [ ! -f "$STATE_DIR/config.json" ]; then
        echo "LG Picture Bridge is not configured; startup skipped"
        return 0
    fi
    if [ ! -x "$NODE_BIN" ]; then
        echo "Node.js was not found at $NODE_BIN" >&2
        return 1
    fi
    # Also migrate upgrades started through the previous 55-* hook.
    "$APP_ROOT/scripts/install-startup.sh" install ||
        echo "LG Picture Bridge could not update its startup hook" >&2
    if is_running; then
        echo "LG Picture Bridge is already running"
        return 0
    fi

    "$APP_ROOT/scripts/install-security.sh" install
    umask 077
    "$NODE_BIN" -e 'require(process.argv[1]).trimLog()' "$APP_ROOT/bridge/lib/runtime-store" || return 1
    rm -f "$PID_FILE"
    nohup "$APP_ROOT/scripts/runner.sh" >>"$LOG_FILE" 2>&1 </dev/null &
    bridge_pid=$!
    echo "$bridge_pid" >"$PID_FILE"
    sleep 1
    if ! kill -0 "$bridge_pid" 2>/dev/null; then
        echo "LG Picture Bridge exited during startup; inspect $LOG_FILE" >&2
        rm -f "$PID_FILE" "$LEGACY_PID_FILE"
        return 1
    fi
    echo "LG Picture Bridge started as PID $bridge_pid"
}

stop_bridge() {
    # Revoke even cached QML immediately; preserve the opt-in for the next start.
    "$NODE_BIN" "$APP_ROOT/bridge/cec-guard-cli.js" suspend || true
    if ! is_running; then
        rm -f "$PID_FILE" "$LEGACY_PID_FILE"
        echo "LG Picture Bridge is not running"
        return 0
    fi
    kill "$bridge_pid" 2>/dev/null || true
    wait_count=0
    while kill -0 "$bridge_pid" 2>/dev/null && [ "$wait_count" -lt 10 ]; do
        sleep 1
        wait_count=$((wait_count + 1))
    done
    if kill -0 "$bridge_pid" 2>/dev/null; then
        kill -9 "$bridge_pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE" "$LEGACY_PID_FILE"
    echo "LG Picture Bridge stopped"
}

case "${1:-start}" in
    start) start_bridge ;;
    stop) stop_bridge ;;
    restart)
        stop_bridge
        start_bridge
        ;;
    status)
        if is_running; then
            echo "running"
        else
            echo "stopped"
            exit 1
        fi
        ;;
    *)
        echo "Usage: startup.sh {start|stop|restart|status}" >&2
        exit 2
        ;;
esac
