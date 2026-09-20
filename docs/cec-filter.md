# Optional Apple TV wake filter (0.6.0)

**Off by default. Rooted C9 firmware only, with an exact QML-file hash check.**
This option prevents one LG behavior: automatically selecting Apple TV as the CEC
device when the HDMI 3 app activates, including when native LG AirPlay ends.
It is not a general CEC packet filter or an incoming-power setting on Apple TV.

Open LG Picture Bridge and select **Apple TV wake filter: Off**, then confirm.
The option survives updates and TV reboots as part of the existing bridge startup.
Enabling it can briefly restart the HDMI 3 app to load the overlay; boot activation
can also require this one-time reload. Periodic refreshes do not repeatedly restart
HDMI. If LG rejects the close request, the overlay applies on the next fresh HDMI-app
launch; an installed overlay alone is not proof that a particular wake was suppressed.

Select the same button again to turn it off. The existing loaded QML checks its
local permission file on every relevant CEC call, so disabling does not require a
TV reboot or an HDMI restart. The option uses an app-authorized Luna method, not
an arbitrary shell/CEC command sent through MQTT. MQTT picture commands and
Home Assistant automations are unchanged.

## Scope and safeguards

- Only automatic selection on TV HDMI 3 is eligible. An explicit `launchUniqueId`
  is left alone, as are other inputs/devices and unknown or ambiguous discovery.
- Apple identity must match vendor 4346, playback-device type 4, port 3 and OSD
  name Apple TV. Logical addresses are discovered, not hardcoded. Cached device
  metadata must not be interpreted as the external HDMI switch's selected port.
- SIMPLINK and Auto Power Sync stay unchanged. Nintendo wake/sleep and Sonos
  audio/volume passed the earlier supervised interception trial. LG-remote
  navigation/automatic device selection for Apple TV may be affected; use the
  Apple remote if needed. Other CEC pathways may still wake a device.
- Only the inspected original `Simplink.qml` SHA-256 is accepted. No firmware is
  overwritten or remounted writable; a generated copy is file-bind-mounted from
  `/tmp/lgpb-apple-tv-cec`. Another modification/foreign overlay is not overwritten.
- Root refreshes a non-secret local permission file every 30 seconds. It expires
  after 90 seconds. QML reads it locally without network access; missing, invalid,
  expired or unreadable policy leaves LG behavior intact. A separate watchdog
  removes the owned overlay when the refresh stops (up to 15 seconds after expiry).
- Suspending the bridge revokes the policy and removes the overlay. The saved
  opt-in is reapplied when the service restarts. The QML hash is checked again
  when a new overlay is created, including after a full TV reboot/firmware update.
- **Remove configuration** revokes/removes the filter and its saved preference
  before stopping the bridge. Prefer this before uninstalling. Direct uninstall
  also makes the running guard/watchdog restore normal behavior once detected.

## Emergency off / restore

From an existing authorized root SSH session:

```sh
/usr/bin/node /media/developer/apps/usr/palm/applications/io.github.andrewkennedy.lgpicturebridge/bridge/cec-guard-cli.js remove
```

This removes only the CEC option and its runtime overlay; MQTT credentials and
picture settings remain intact. A full reboot clears all `/tmp` mounts, but an
enabled saved preference will reapply at startup: disable/remove the option first
if you want it to stay off. Quick Start standby is not a full reboot.

The preference is a separate root-only file:
`/var/lib/io.github.andrewkennedy.lgpicturebridge/cec-guard.json`.
Do not alter `config.json` to disable CEC; that file holds broker credentials.

## Validation status

The earlier ten-minute trial prevented Apple TV wake after native AirPlay ended;
the user also confirmed Nintendo wake/sleep and Sonos audio/volume. See the
[experiment record](../experiments/apple-tv-cec/README.md).
The persistent file-read/lease lifecycle requires its own live confirmation in
addition to those trial results. Unit tests cover targeting, off/expiry/read errors,
foreign/unsafe files, service restart, watchdog, uninstall and configuration-save
failure. UI tests cover the fifth button without reintroducing screen overflow.

This feature does not fix native AirPlay's first connection attempt timing out
after waking the TV from standby; that is a separate unresolved issue.
