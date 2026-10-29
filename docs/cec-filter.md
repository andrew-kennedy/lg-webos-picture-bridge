# MQTT-configured CEC filtering on G6

Home Assistant owns the device/input policy. The webOS app contains **no device
names, vendor IDs or default block rules**. It provides a firmware-specific,
reversible interception mechanism and a strict generic rule evaluator.

## Supported behavior—and the standby limitation

The inspected G6 supports `automatic_selection`: skip the HDMI app's automatic
`setCECUniqueId` call when a configured rule matches. This includes LG's unknown-device
fallback on a shared input containing a matching device, as described below. It is
**not a universal CEC wake-command filter**. `automatic_selection` leaves explicit
selections alone. The additional `device_selection` action makes a configured HDMI
input a TV-only operation, as described below. Inbound device→TV power requests
and other CEC paths are unaffected.

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

1. Install the full package so the read-only EIM discovery permission is installed.
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
There are no built-in exceptions. Device rules match only configured identities;
input-only rules suppress outgoing HDMI-app selection on the configured port.
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

Logical addresses are discovered per call rather than stored as match keys. Conflicting
identities for a requested logical address fail open. LG's `255` sentinel is a special
case: it requests restoration of the input's remembered physical route, not a specific
CEC device. If the HDMI app identifies any policy-matched device on that input, the
filter suppresses this automatic fallback. It cannot determine which device the native
fallback would select. Known unprotected devices and fresh explicit device selections
still follow normal LG behavior. Missing or unmatched inventory leaves the fallback alone.

`inventory.devices` is read from EIM
every 30 seconds and can contain cached devices. It **does not reveal the external
HDMI switch's selected route, live power state, or current active source**. Failed
inventory requests publish unavailable/empty inventory, not fabricated presence.

From 0.10.0, unchanged inventory observations do not trigger another publication or change timestamp
attributes. Devices are compared in a stable order, and `inventory.changed_at` records changes to
the device list or read/error status. It is not a freshness timestamp or proof of current presence.
The regular 30-second CEC status heartbeat still prevents Home Assistant's 90-second expiry.
The filter uses the HDMI app's current device metadata independently of that poll.

### Input switching without source wake (0.10.2)

LG's input picker can launch HDMI 3 with `{"id":"uniqueId","value":4}` even when
the user intends to select the physical port. `automatic_selection` deliberately
allows such a fresh explicit request. On the verified G6 that request selected
Apple TV and sent it `Set Stream Path` after a successful Nintendo wake test.

Use `device_selection` with an **input-only** match to suppress both automatic and
explicit CEC selection from the HDMI app. For example:

```yaml
rules:
  - id: hdmi1_input_only
    match: {input: hdmi1}
    block: [device_selection]
  - id: hdmi2_input_only
    match: {input: hdmi2}
    block: [device_selection]
  - id: hdmi3_input_only
    match: {input: hdmi3}
    block: [device_selection]
  - id: hdmi4_input_only
    match: {input: hdmi4}
    block: [device_selection]
```

This changes only the TV's video input. It does not select a device behind an external
HDMI switch. Source remotes and Home Assistant can still wake those devices and route
the external switch. Incoming CEC wake/active-source messages and audio/volume control
are unaffected. Matching is independent of device inventory, logical address, and
explicit-selection parameters. Combining `device_selection` with vendor/name/type
matches is rejected; `automatic_selection` remains available for device-specific rules.
Existing policies keep their behavior until changed. The same permission lease and
master switch govern both actions. Missing or expired permission restores LG behavior.

Live G6 validation on 2026-10-27 used the installed 0.10.2 IPK. After Apple TV was
put to sleep, Nintendo woke the TV; the user selected HDMI 1 and returned to HDMI 3
through LG's input picker. QML logged `device_selection` suppression for HDMI 1's
unknown selection and HDMI 3's explicit device ID. The user confirmed Apple TV
stayed asleep and Nintendo remained visible. HA showed Nintendo's session armed
and Game mode; SIMPLINK and Auto Power Sync remained on. All four port rules were
confirmed through MQTT. Automated tests also exercise the minified IPK's policy
and generated QML, including explicit Apple TV-style IDs and missing inventory.

A full policy replaces the old one. `{enabled: false}` or `{enabled: true}` changes
only the master state. `rules: []` with a full policy blocks nothing and removes the
overlay. With an existing generic overlay, rule edits update its local permission
file immediately: no HDMI restart or rebuild is needed. Installing a fresh overlay
(including after a cold boot) can close cached HDMI apps once to load the new code.
From 0.13.3, an active full-screen HDMI app is reopened immediately after that close.
The bridge checks foreground apps and native power at reload time; it leaves existing
Home previews/multiview alone and does not restore over another app/input or after
the screen turns off. Failed foreground/power reads defer the disruptive operation.
The reopen uses only the HDMI app ID, with the filter already mounted and its lease
valid; it does not replay CEC device-selection parameters or send a power command.
There is no recurring input-selection loop or Home Assistant recovery automation.
`reload_status` distinguishes `requested`, `next_launch`, `reopened`, `reopen_skipped`
and `reopen_failed`. These are API outcomes, not proof of QML execution.

The 2026-10-28 G6 startup log showed HDMI 3 full-screen at 11:23:54.055, followed by
the filter's close at 11:23:54.662. Home became foreground and reopened HDMI 3 as a
preview. The bridge started picture management after that close, so the apparent
picture-setting transition was coincidental. Regression tests cover all four HDMI
inputs, existing Home/app/multiview focus, navigation/power changes during reload,
failed API calls and silent lease renewal/rule changes.

Live validation on firmware 43.21.69 confirmed the packaged 0.13.3 manager reopened
HDMI 3 in its normal full-screen view, with filtering active and unchanged saved
profiles/configuration. The user then slept Apple TV, waited for the TV to turn off,
and woke Apple TV again; HDMI 3 stayed full-screen without using the LG remote.

## Cold-start timing (0.13.4)

The bridge runs in the background once Homebrew starts it. On the inspected G6,
a cold boot launched HDMI around 12 seconds and produced a picture around 17
seconds. Activity Manager, which starts Homebrew Channel, became ready around
21 seconds. The Homebrew script began around 23 seconds; the bridge followed at
30 seconds after another application's startup hook. Those timings describe the
observed boot, not guaranteed deadlines.

The bridge now installs `45-lg-picture-bridge`, ahead of the observed `50-*`
privacy hook, instead of `55-lg-picture-bridge`. Pairing and normal script startup
migrate the old owned link automatically; unchanged starts do not rewrite it.
Clearing configuration removes either owned link. Homebrew's startup and failsafe
behavior remain in control. This reduces avoidable waiting but does **not** install
the RAM overlay before HDMI on a cold boot: its one-time reload can still blank
the picture briefly. No firmware or system boot units are changed.

Quick Start+ was off on the inspected G6. A warm resume may retain the process and
RAM overlay and avoid a fresh installation; it needs separate live verification.
The existing lease-expiry/recovery rules still apply during standby. Quick Start+
does not remove the cold-start limitation after an actual reboot or power loss.

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

The exact inspected original `SimplinkController.qml` SHA-256 is required. The G6
allowlist covers firmware **43.11.73** and **43.21.69**. The latter adds logging and
only marks CEC selection complete when the unique ID is valid; the intercepted
selection call is the same interception point for both supported actions. Unknown firmware
or foreign overlays are refused. A generated copy is bind-mounted; firmware is
never overwritten or remounted writable. Root refreshes a non-secret permission
file every 30 seconds; it expires after 90 seconds. Missing, unreadable, invalid or
expired permission leaves normal LG behavior intact. A separate watchdog removes
the owned overlay after expiry, with the bounded late-tick grace described below.
Broker disconnection alone does not erase a saved
policy: the running local bridge continues enforcing it independently of MQTT.

## G6 selection lifecycle and unknown-device fallback

Two G6 wake paths could bypass the original HDMI-app filter:

- LG's explicit-selection handler assigns `launchUniqueId`, replacing its QML binding
  to the deep-link handler. Minimizing HDMI cleared only the deep-link value, leaving
  the prior selection marked explicit on the next wake. The overlay now restores that
  binding when HDMI is minimized. Fresh direct and deferred selections remain available.
- With no current CEC focus, the HDMI app can send `uniqueId: 255`. On firmware
  43.21.69, a captured Nintendo wake followed this call with native
  `_commandHandler_SelectDevice_unknownDev`, a restore of Apple TV's physical route,
  and a `Set Stream Path` message waking Apple TV. Policy matching now covers this
  fallback when a protected device is identified on the same input.

These changes add no polling, Home Assistant timing rules, native binary patches,
or persistent diagnostic writes. They keep the existing lease and removable QML
overlay. They do not intercept the separate native last-device power-on path.
Regression tests cover stale explicit selections across repeated minimization,
fresh explicit selections, shared-input fallback, known unprotected sources,
missing/unmatched inventory, and expired leases.

Live verification on OLED77G6WUA / 43.21.69, 2026-10-27: after the user put Apple TV
to sleep and woke Nintendo with its controller, QML logged the configured rule
blocking `device=255`. The CEC log showed Nintendo's wake and active-source messages,
then focus moving to Nintendo, with no Apple TV `Set Stream Path` during that wake.
The user confirmed Apple TV stayed asleep; Home Assistant agreed and armed the
Nintendo session. This verifies that sequence, not every native CEC power path or
long-standby ordering. No Home Assistant automation guard was added.

## Standby recovery (0.7.1)

On the C9, long Quick Start standby can pause both the bridge and its detached
watchdog. The saved lease expires while asleep. Previously, if the watchdog ran
before renewal after wake, it removed the overlay; the next manager tick installed
it again and closed the HDMI apps to load it. That caused a second picture blank
after normal source wake and picture-profile setup, even for a device not matched
by any CEC rule.

The 2026-09-27 incident's HA history showed an expired-but-mounted filter at wake,
a successful SDR Game write, then HDMI 3's `reload_status` changing from
`next_launch` to `requested` alongside lost input/signal telemetry. Signal recovered
and HA reapplied the game profile. No input-selection or external-switch IR script
ran. Both watchdog-first and renewal-first orderings were reproduced locally.
The exact on-TV timer ordering was inferred from this evidence, not captured by SSH.

The fix changes only watchdog recovery:

- If the gap between watchdog checks exceeds two 15-second intervals, and
  a structurally valid lease expired after the preceding check, allow one fixed
  **45-second recovery window** for the 30-second renewal loop to run.
- The expired lease is **not extended or honored by QML**. Filtering remains
  fail-open until the live bridge writes a fresh valid lease. `lease_active`
  remains false during that window.
- Once renewed, the existing owned overlay is reused without closing any HDMI app.
- If the bridge does not recover, the watchdog removes the overlay on its first
  check at/after the fixed deadline. Additional late ticks do not extend it.
- A normally ticking watchdog still removes an expired overlay without grace.
  Revoked/invalid permissions, missing application/configuration, and errors do not
  get the recovery window. A backwards clock during recovery cancels the window.
- Old detached watchdogs are retired by changing their owner generation once on
  upgrade. The replacement adopts the existing overlay without an HDMI reload.

This is bounded recovery after a delayed callback, not a claim to detect sleep
perfectly: a long process stall or forward wall-clock jump can also qualify.
The QML permission's original 90-second safety limit is unchanged. A genuinely
new overlay, an overlay revision change or re-enable after removal can still
require the existing one-time HDMI reload; the fix does not suppress those.

Validation: all automated tests include both long-standby timer orderings,
repeated sleep, a newer lease issued between watchdog ticks, dead-manager cleanup,
fixed grace expiry, revocation/corruption/uninstall/backwards-clock handling, and
old-watchdog replacement/failure. The watchdog regression suite also passes on
Node 0.12.2, and all bridge/service runtime files pass that parser. The complete
27-file suite, 12 browser layout scenarios, metadata validation and IPK build pass
on the development runtime. These are mocked tests, not a new hardware
sleep/wake verification. The 0.7.0 live checks below remain historical.

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
Live 0.7 validation on the rooted C9, 2026-09-20:

- Installed the complete package and enabled the separate MQTT CEC endpoint while
  preserving all existing broker credentials and other bridge configuration.
- Confirmed the legacy enabled flag migrated to `needs_policy`, with the original
  firmware file restored, until an explicit policy was sent from HA.
- Installed both HA scripts, passed HA configuration validation, and applied the
  central rules through MQTT. The discovered sensor reported the confirmed policy,
  capabilities and read-only EIM inventory. Inventory was not treated as routing state.
- Opened/returned from the bridge UI on HDMI 3; native QML logged the configured
  `streaming_player_auto_selection` rule blocking automatic selection.
- Changed only the rule ID over MQTT, then exercised the same path. QML logged the
  new ID while the overlay generation and hash stayed unchanged. Restored the
  central HA policy afterward. This verifies live policy changes without remounting.
- Sent a policy containing `standby`. The correlated result was
  `unsupported_cec_action`, and the existing active policy/hash remained unchanged.
- Toggled the discovered HA switch off/on. Off removed the overlay and restored
  original SHA-256 `ad7752a5211385a019dd3aa80a5333fc663481c94d3912c80884c0976d55584c`;
  on reapplied the same saved rules.
- Restarted the bridge; the persisted policy and MQTT discovery recovered. Repeated
  HA switch off/on successfully with the new command session.
- Confirmed SIMPLINK and Auto Power Sync remained enabled. The live 1920×1080 TV UI
  showed generic HA-rule status, with every button within the viewport.
- After restoring the HA-owned rule, the user repeated AirPlay directly to LG and
  stopped playback: Apple TV stayed asleep.

Automated checks: all 27 test files, project validation, build, 12 layout scenarios,
and Node 0.12 syntax checks passed. HDMI 1/2/4 matching is unit-tested, not separately
hardware-verified. A full power-loss reboot and native standby interception were
not tested. Earlier Nintendo/Sonos user checks belong to the linked 0.6 record;
they are not inferred to be fresh 0.7 tests.

Filtering does not fix native AirPlay's separate first connection timeout after standby.
