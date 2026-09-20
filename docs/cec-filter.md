# Generic MQTT-configured CEC filtering (0.7.0)

Home Assistant owns the device/input policy. The webOS app contains **no device
names, vendor IDs or default block rules**. It provides a firmware-specific,
reversible interception mechanism and a strict generic rule evaluator.

## Supported behavior—and the standby limitation

The inspected C9 supports `automatic_selection`: skip the HDMI app's automatic
`setCecUniqueId` call when a configured rule matches. This prevented unwanted
source wake on return from native LG AirPlay in the supervised 0.6 tests. It is
**not a universal CEC wake-command filter**. Explicit device selections, inbound
device→TV power requests, and other CEC paths are unaffected.

Per-device `standby` interception is **not implemented or advertised as supported**.
Read-only inspection on 2026-09-20 found `API_CECP_SetStandby`, `CECP_SetStandby` and
`CECP_process_Standby` inside `/mnt/lg/tvservice/lgapp/tvservice`. The inspected HDMI
QML has no equivalent standby-send hook. Luna introspection of the TV externaldevice,
UTP externaldevice and TV power services did not expose a per-device blocking control.
`getClientList` shows the native TV service participating in shutdown/suspend.
These are leads for separate native-code investigation, not proof of a safe hook.
No native binary, power-service registration or global CEC setting was changed.

A request containing `standby`, `wake`, arbitrary commands, or any other unsupported
action fails with `unsupported_cec_action`; it does not partially apply the other
rules. A future verified interception can add another action to the same rule model.
The status sensor publishes the firmware's actual capabilities.

## Setup and Home Assistant controls

1. Install the full 0.7 package so the read-only EIM discovery permission is installed.
2. Opt in with `mqtt.cec_commands_enabled: true` in the saved broker setup. This is
   separate from `mqtt.commands_enabled` for picture writes; preserve all existing
   credentials, device ID and other setup fields when reconfiguring.
3. Install [LG TV MQTT CEC Policy](../home-assistant/lg_picture_bridge_mqtt_cec_policy.example.yaml)
   as `script.lg_tv_mqtt_cec_policy`.
4. Adapt [the central HA rules script](../home-assistant/lg_picture_bridge_cec_rules.example.yaml)
   and run it. That example contains device-specific information; the app does not.

MQTT discovery adds these entities to the existing bridge device:

- `switch.lg_tv_cec_filter`: master enabled state, confirmed by the bridge. Off keeps
  the rule set but revokes enforcement and restores normal LG behavior.
- `sensor.lg_tv_cec_filter`: `off`, `active`, `no_rules`, `inactive`, `needs_policy`,
  or `error`. Attributes expose `policy`, `policy_hash`, `capabilities`, `inventory`,
  `session_id`, `ready`, `command_topic`, `results`, and overlay/error details.

Entity IDs may differ if already used/renamed. Pass `command_entity` to the script
if needed. The discovered switch does not embed an HA entity ID in its command
template, so renaming the sensor does not break the switch.

The TV UI's **CEC filtering** button is a master override, not a device-policy editor.
There are no built-in exceptions: preserve Nintendo/Sonos by not matching them.
Rules persist locally and reapply through the bridge's existing startup hook; HA
does not need to race a wake event or replay configuration on every restart. Run
the HA rules script after editing it. It is not automatically re-sent on connection,
so reconnecting does not undo a deliberate master-off override.

## Policy

```yaml
action: script.lg_tv_mqtt_cec_policy
data:
  policy:
    version: 1
    enabled: true
    rules:
      - id: streaming_player_auto_selection
        match:
          input: hdmi3
          vendor_id: 4346
          osd_name: Apple TV
          device_type: 4
        block:
          - automatic_selection
```

This is an **example HA-owned policy**, not an app default. Rules AND all specified
match fields; matching any rule blocks its listed supported action. Omitted fields
are unconstrained. Allowed fields are `input` (`hdmi1`–`hdmi4`), `vendor_id` (integer),
`osd_name` (trimmed, case-insensitive exact match), `device_type` (integer), and
`physical_address` (integer). A match needs at least one field. An input-only rule
deliberately covers all identified CEC devices selected on that TV input. Be careful
with shared inputs. Maximum 32 rules; IDs are unique, bounded strings. There are no
regexes, shell snippets, arbitrary Luna URIs or policy-selected executable paths.

Logical addresses are discovered per call rather than stored as match keys. Unknown
or ambiguous device identity does not block. `inventory.devices` is read from EIM
every 30 seconds and can contain cached devices. It **does not reveal the external
HDMI switch's selected route, live power state, or current active source**. Failed
inventory requests publish unavailable/empty inventory, not fabricated presence.
The filter uses the HDMI app's current device metadata independently of that poll.

A full policy replaces the old one. `{enabled: false}` or `{enabled: true}` changes
only the master state. `rules: []` with a full policy blocks nothing and removes the
overlay. With an existing generic overlay, rule edits update its local permission
file immediately: no HDMI restart or rebuild is needed. First installation or
re-enabling after removal can close cached HDMI apps once to load the new code.
No input is selected and no TV power or CEC power command is sent by that reload.
`reload_status` reports requested/next-launch status, not proof of QML execution.

## MQTT protocol and safety

Topics are `<topic_prefix>/lgpb_<device-hash>/cec/command` and `/cec/state`.
Use the HA script, which obtains the current session, generates a request ID and
expiry, retries the identical envelope, and requires a matching success result.
The envelope is protocol 1 with `request_id`, `session_id`, `expires_at` (Unix seconds
within the next 60 seconds), and `policy`. Retained commands are ignored; old sessions
and expired commands are rejected. Exact retries do not repeat changes. Results
include the applied policy hash, enabled state, rule count and filter state. This
confirms bridge application, not that every power path or a specific wake was blocked.

Extend broker ACLs only for these scoped command/state topics and discovery. Treat
publish access as permission to change CEC rules. The picture-command opt-in and
HTTP bearer token do not enable or authorize this separate MQTT endpoint. Discovery
and availability are retained; state and command messages are not. HA switch state
is not optimistic. Status refreshes every 30 seconds and expires after 90 seconds.

The exact inspected original `Simplink.qml` SHA-256 is required. Unknown firmware
or foreign overlays are refused. A generated copy is bind-mounted; firmware is
never overwritten or remounted writable. Root refreshes a non-secret permission
file every 30 seconds; it expires after 90 seconds. Missing, unreadable, invalid or
expired permission leaves normal LG behavior intact. A separate watchdog removes
the owned overlay after expiry. Broker disconnection alone does not erase a saved
policy: the running local bridge continues enforcing it independently of MQTT.

## Upgrade from 0.6 / restore

The old enabled boolean cannot describe a generic rule. On upgrade it is reported
as `needs_policy`, and its overlay is revoked until HA supplies an explicit policy.
The app never invents an Apple TV rule. The runtime directory retains its historical
name `/tmp/lgpb-apple-tv-cec` only so already-loaded 0.6 QML can be revoked safely;
the path is not device matching. New leases use schema 2, which old QML rejects.

The root-only preference remains
`/var/lib/io.github.andrewkennedy.lgpicturebridge/cec-guard.json`. Do not edit the main
`config.json` to disable filtering: it contains broker credentials.

Emergency off/removal over authorized root SSH:

```sh
/usr/bin/node /media/developer/apps/usr/palm/applications/io.github.andrewkennedy.lgpicturebridge/bridge/cec-guard-cli.js remove
```

This removes only CEC rules and runtime state, preserving broker/picture setup.
The TV app's **Remove configuration** also removes filtering before clearing all
configuration. Direct uninstall is detected by the running guard/watchdog. A full
reboot clears the temporary mount but reapplies a saved enabled policy; disable it
first to keep it off. Quick Start standby is not a full reboot.

## Validation

The [0.6 live-test record](https://github.com/andrew-kennedy/lg-webos-picture-bridge/blob/v0.6.0/docs/cec-filter.md)
documents the initial AirPlay fix, Nintendo/Sonos checks, immediate off and restart.
Version 0.7 has separate tests for generic identity/input matching, malformed and
unsupported policies, dynamic cached-QML changes, lease expiry, safe mounts,
legacy migration, MQTT sessions/retries/retained-message rejection and discovery.
Live 0.7 validation is recorded here after installation, not inferred from 0.6.

Filtering does not fix native AirPlay's separate first connection timeout after standby.
