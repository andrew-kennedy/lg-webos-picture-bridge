# Temporary Apple TV automatic-CEC-selection experiment

**Experimental, SSH-only, not installed by the app, and not enabled at boot.** This tests a
possible cause of Apple TV waking when native LG AirPlay exits to HDMI 3. It is not a generic
CEC packet filter and it is not yet a bridge/MQTT feature.

## Validation status

On 2026-09-19, the C9 running Node 0.12.2 accepted a 30-second overlay trial. Its independent
watchdog automatically unmounted the overlay and the original QML SHA-256 matched afterward.
Explicit restore also succeeded. The application-manager `closeByAppId` call restarted the HDMI
app, and HDMI 3 returned with a good signal. At 20:35:20 PDT, a full-screen bridge-UI → HDMI 3
transition logged both `LGPB_CEC_TRIAL evaluating automatic selection: 4` and
`LGPB_CEC_TRIAL suppressed Apple TV automatic selection`, with no corresponding
`responseSetCecUniqueId`. This confirms the new QML loaded and skipped the intended call.
**Preventing the actual unwanted wake after AirPlay is not yet confirmed.** Nintendo wake/sleep
and Sonos control also need an end-to-end check before this becomes a persistent feature.

The C9 Home ribbon alone did not deactivate the HDMI app, so Home → HDMI was not a useful
activation test; a full-screen app was needed. The original `SIMPLINK: setCecUniqueId` log occurs
before the inserted guard, so that log alone does not establish that a request was sent.

The inspected C9 HDMI application's `Simplink.qml` selects a remembered CEC device using
`setCECUniqueId` on activation. The trial skips only this call for an automatically selected
Apple TV on HDMI 3. It requires a unique discovered entry matching Apple vendor 4346,
playback-device type 4, and OSD name `Apple TV`; it does not assume logical address 4 or infer
the external HDMI switch's selected port. Explicit `launchUniqueId` selections, other devices,
unknown/ambiguous discovery, and other HDMI inputs retain LG behavior.

## Safety and rollback

- The exact original file SHA-256 is allowlisted. Unknown firmware or an existing overlay is
  refused. Never bypass the check merely to enable a different TV/firmware version.
- A copy is generated in root-owned `/tmp/lgpb-cec-trial` and bind-mounted over one QML file.
  The original read-only firmware is never overwritten or remounted writable.
- Trial duration is 30–600 seconds. The QML guard itself stops suppressing calls at its deadline,
  including if cached in a running app. A separate watchdog unmounts the overlay at the deadline.
- `restore` unmounts only a verified overlay belonging to this trial and verifies the original
  firmware hash. Already loaded QML needs an HDMI-app restart for **immediate** rollback;
  otherwise its suppression stops at the original deadline. File restoration alone does not
  reload a running QML engine.
- A **full reboot/power cycle**, not Quick Start standby, removes this nonpersistent overlay
  and cached process. No startup hook is created, so the experiment does not return on boot.
- No TV power, input, app restart, IR, SIMPLINK, Auto Power Sync, or picture-setting commands are
  issued by these scripts. An HDMI-app restart is a separate supervised test step.
- A bad QML change could temporarily interrupt HDMI display/control. Root access and a full
  reboot are the recovery path. This is not a claim of zero operational risk.

## Run a supervised trial

Copy `guard.js` and `trial.js` together to a private directory on the TV (outside its firmware
and outside startup hooks), then run as root using the TV's Node binary:

```sh
/usr/bin/node /tmp/lgpb-cec-tools/trial.js inspect
/usr/bin/node /tmp/lgpb-cec-tools/trial.js apply 600
```

Coordinate an HDMI-app restart so it loads the overlay, verify the actual suppression marker
in `/var/log/inputcommon`, then repeat native TV AirPlay → stop while Apple TV is asleep.
Confirm Apple TV stays asleep and that ordinary Apple playback, Nintendo wake/sleep, and Sonos
audio/control still work before considering a persistent opt-in bridge integration.

Rollback from a second SSH session if needed:

```sh
/usr/bin/node /tmp/lgpb-cec-tools/trial.js restore
/usr/bin/node /tmp/lgpb-cec-tools/trial.js inspect
```

After the test, restore, confirm the original hash, and remove only the trial's temporary
files. Keep the source and results in the repository. Do not distribute LG's original QML.

See [webOS Homebrew's runtime-overlay documentation](https://www.webosbrew.org/pages/filesystem-overlays).
