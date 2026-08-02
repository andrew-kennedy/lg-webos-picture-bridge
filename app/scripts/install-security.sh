#!/bin/sh

set -eu

APP_ID="io.github.andrewkennedy.lgpicturebridge"
APP_ROOT="/media/developer/apps/usr/palm/applications/$APP_ID"
POLICY_ROOT="$APP_ROOT/security"
MANIFEST_TARGET="/var/luna-service2/manifests.d/$APP_ID.json"
APP_ROLE_TARGET="/var/luna-service2/roles.d/$APP_ID.app.role.json"
ROLE_TARGET="/var/luna-service2/roles.d/$APP_ID.service.role.json"
APP_PERMISSION_TARGET="/var/luna-service2/client-permissions.d/$APP_ID.app.perm.json"
PERMISSION_TARGET="/var/luna-service2/client-permissions.d/$APP_ID.service.perm.json"
SERVICE_TARGET="/var/luna-service2/services.d/$APP_ID.service.service"
changed=0

copy_policy() {
    source_file="$1"
    target_file="$2"
    if [ ! -f "$target_file" ] || ! cmp -s "$source_file" "$target_file"; then
        cp -f "$source_file" "$target_file"
        chmod 0644 "$target_file"
        changed=1
    fi
}

scan_if_changed() {
    if [ "$changed" -eq 1 ]; then
        /usr/sbin/ls-control scan-services
    fi
}

case "${1:-install}" in
    install)
        mkdir -p \
            /var/luna-service2/manifests.d \
            /var/luna-service2/roles.d \
            /var/luna-service2/client-permissions.d \
            /var/luna-service2/services.d
        copy_policy "$POLICY_ROOT/$APP_ID.manifest.json" "$MANIFEST_TARGET"
        copy_policy "$POLICY_ROOT/$APP_ID.app.role.json" "$APP_ROLE_TARGET"
        copy_policy "$POLICY_ROOT/$APP_ID.service.role.json" "$ROLE_TARGET"
        copy_policy "$POLICY_ROOT/$APP_ID.app.perm.json" "$APP_PERMISSION_TARGET"
        copy_policy "$POLICY_ROOT/$APP_ID.service.perm.json" "$PERMISSION_TARGET"
        copy_policy "$POLICY_ROOT/$APP_ID.service.service" "$SERVICE_TARGET"
        scan_if_changed
        ;;
    remove)
        for target_file in \
            "$MANIFEST_TARGET" \
            "$APP_ROLE_TARGET" \
            "$ROLE_TARGET" \
            "$APP_PERMISSION_TARGET" \
            "$PERMISSION_TARGET" \
            "$SERVICE_TARGET"
        do
            if [ -f "$target_file" ]; then
                rm -f "$target_file"
                changed=1
            fi
        done
        scan_if_changed
        ;;
    *)
        echo "Usage: install-security.sh {install|remove}" >&2
        exit 2
        ;;
esac
