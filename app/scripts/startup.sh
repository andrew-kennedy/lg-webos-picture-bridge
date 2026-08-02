#!/bin/sh

APP_ID="io.github.andrewkennedy.lgpicturebridge"
APP_ROOT="/media/developer/apps/usr/palm/applications/$APP_ID"
STATE_DIR="/var/lib/$APP_ID"
PID_FILE="$STATE_DIR/bridge.pid"
LOG_FILE="$STATE_DIR/bridge.log"
NODE_BIN="/usr/bin/node"

is_running() {
    command_line=""
    [ -f "$PID_FILE" ] || return 1
    bridge_pid="$(sed -n '1p' "$PID_FILE" 2>/dev/null)"
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
        echo "LG Picture Bridge is not paired; startup skipped"
        return 0
    fi
    if [ ! -x "$NODE_BIN" ]; then
        echo "Node.js was not found at $NODE_BIN" >&2
        return 1
    fi
    if is_running; then
        echo "LG Picture Bridge is already running"
        return 0
    fi

    "$APP_ROOT/scripts/install-security.sh" install
    mkdir -p "$STATE_DIR"
    rm -f "$PID_FILE"
    if [ -f "$LOG_FILE" ] && [ "$(wc -c <"$LOG_FILE")" -gt 1048576 ]; then
        mv -f "$LOG_FILE" "$LOG_FILE.1"
    fi
    nohup "$APP_ROOT/scripts/runner.sh" >>"$LOG_FILE" 2>&1 </dev/null &
    bridge_pid=$!
    echo "$bridge_pid" >"$PID_FILE"
    sleep 1
    if ! kill -0 "$bridge_pid" 2>/dev/null; then
        echo "LG Picture Bridge exited during startup; inspect $LOG_FILE" >&2
        rm -f "$PID_FILE"
        return 1
    fi
    echo "LG Picture Bridge started as PID $bridge_pid"
}

stop_bridge() {
    if ! is_running; then
        rm -f "$PID_FILE"
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
    rm -f "$PID_FILE"
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
