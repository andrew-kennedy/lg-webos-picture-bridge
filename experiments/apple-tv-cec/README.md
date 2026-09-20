# Temporary Apple TV automatic-CEC-selection experiment

**Experimental, SSH-only, not installed by the app, and not enabled at boot.** This tests a
possible cause of Apple TV waking when native LG AirPlay exits to HDMI 3. It is not a generic
CEC packet filter. Version 0.6 adds a separate, opt-in bridge feature with a renewable
local permission file; see [the feature documentation](../../docs/cec-filter.md).

## Validation status

On 2026-09-19, the C9 running Node 0.12.2 accepted a 30-second overlay trial. Its independent
watchdog automatically unmounted the overlay and the original QML SHA-256 matched afterward.
Explicit restore also succeeded. The application-manager `closeByAppId` call restarted the HDMI
app, and HDMI 3 returned with a good signal. At 20:35:20 PDT, a full-screen bridge-UI → HDMI 3
transition logged both `LGPB_CEC_TRIAL evaluating automatic selection: 4` and
`LGPB_CEC_TRIAL suppressed Apple TV automatic selection`, with no corresponding
`responseSetCecUniqueId`. This confirms the new QML loaded and skipped the intended call.
The initial trial did not establish wake prevention. **A later supervised AirPlay retest
did prevent the unwanted Apple TV wake**, as described below. The user subsequently
confirmed Nintendo wake/sleep and Sonos audio/volume still worked during that trial.

The C9 Home ribbon alone did not deactivate the HDMI app, so Home → HDMI was not a useful
activation test; a full-screen app was needed. The original `SIMPLINK: setCecUniqueId` log occurs
before the inserted guard, so that log alone does not establish that a request was sent.

The supervised ten-minute trial ended at 20:39:43 PDT. At 20:40, SSH inspection confirmed the
watchdog had removed the overlay, the original hash matched, and both `simplinkEnable` and
`simplinkAutoPowerOn` were still `on`. The TV had entered Active Standby; it was not woken to
restart its cached QML, whose guard had already expired. No AirPlay retest was observed during
the initial HDMI-app log checks. Subsequent investigation of the user's failed AirPlay attempts
found the startup/shutdown interaction below. No persistent bridge behavior or Home Assistant
configuration was changed.

### AirPlay test blocked by a Home Assistant shutdown rule

The user reported AirPlay connection errors and a No Signal screen during the trial. Correlating
application-manager logs with Home Assistant history/traces confirmed that the existing inferred
Nintendo-session no-signal rule powered the TV off ten seconds after wake, while AirPlay was
starting. For example (PDT): TV on at 20:39:18, AirPlay launch requested at 20:39:24, explicit
HA `media_player.turn_off` at 20:39:28. Another retained trace confirms the same shutdown at
20:38:55. The launch attempts did not become foreground AirPlay sessions in the observed history.

This means the AirPlay → HDMI-return wake test is inconclusive, not a successful validation or
proof of an AirPlay firmware regression. Before retesting, a no-signal shutdown automation must
distinguish actual loss of a previously valid inferred-console signal from a TV starting up with
no HDMI signal. Do not make the CEC modification persistent on the strength of this trial alone.

### Successful AirPlay return retest after fixing the HA startup rule

After the Nintendo rule was changed to require a previously confirmed picture, the user
successfully played native LG AirPlay from standby (the first connection attempt still
timed out). With the CEC filter absent/expired, AirPlay closed at 21:13:02 PDT, LG selected
Apple TV through `setCECUniqueId` at 21:13:04, and HA observed Apple TV off → idle at
21:13:10. The Nintendo shutdown helper remained unarmed.

A fresh ten-minute trial began at 21:15:17 PDT on 2026-09-19, expiring at 21:25:17.
After reloading the HDMI app, the suppression marker appeared on return from the bridge
UI at 21:15:47. Apple TV was put to sleep at 21:16:09. The TV woke for native AirPlay
at 21:16:24; AirPlay became visible and subsequently returned to HDMI 3 twice.
The filter logged suppression at 21:16:36 and 21:16:43, without the corresponding
`responseSetCecUniqueId`. Apple TV remained off in HA afterward, and the user confirmed
that it stayed asleep. This validates the narrow interception for these C9 transitions,
not a generic CEC packet filter or compatibility with other firmware.

The first-attempt AirPlay connection timeout is separate and remains unresolved. The
trial is still temporary; it is not installed by version 0.5.2 or automatically enabled
at boot. The user also confirmed Nintendo wake/sleep and Sonos audio/volume before
approving the separate persistent, reversible option. Its lifecycle and rollback
validation are recorded in the feature documentation, not inferred from this trial.

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
