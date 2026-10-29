#!/bin/sh

set -eu

APP_ROOT="/media/developer/apps/usr/palm/applications/io.github.andrewkennedy.lgpicturebridge"
STARTUP_DIRECTORY="/var/lib/webosbrew/init.d"
STARTUP_TARGET="$APP_ROOT/scripts/startup.sh"
STARTUP_LINK="$STARTUP_DIRECTORY/45-lg-picture-bridge"
LEGACY_LINK="$STARTUP_DIRECTORY/55-lg-picture-bridge"

is_ours() {
    [ -L "$1" ] && [ "$(readlink "$1")" = "$STARTUP_TARGET" ]
}

remove_owned_link() {
    if is_ours "$1"; then
        rm "$1"
    fi
}

case "${1:-install}" in
    install)
        mkdir -p "$STARTUP_DIRECTORY"
        if ! is_ours "$STARTUP_LINK"; then
            # Do not replace an administrator's unrelated file or hook.
            if [ -e "$STARTUP_LINK" ] || [ -L "$STARTUP_LINK" ]; then
                echo "Startup hook already exists and is not owned by LG Picture Bridge: $STARTUP_LINK" >&2
                exit 1
            fi
            ln -s "$STARTUP_TARGET" "$STARTUP_LINK"
        fi
        # Create the replacement before removing the old hook. An unchanged
        # installation performs no writes on subsequent starts.
        remove_owned_link "$LEGACY_LINK"
        ;;
    remove)
        remove_owned_link "$STARTUP_LINK"
        remove_owned_link "$LEGACY_LINK"
        ;;
    *)
        echo "Usage: install-startup.sh {install|remove}" >&2
        exit 2
        ;;
esac
