# LG Picture Bridge

LG Picture Bridge connects a **rooted 2026 LG G6 (webOS 11)** to Home Assistant. It reports HDMI signal presence, input, picture mode, and SDR/HDR10/HLG/Dolby Vision through MQTT discovery, and applies picture profiles without notification dialogs.

Version **0.13.5** fixes remote navigation in the picture-profile editor, including selectors, numeric controls, refreshes, saving, and returning to bridge status. Arrows move focus; OK enters value editing, and OK or Back finishes editing. The automatic-profile toggle now explains its day/night and temporary-adjustment behavior. The bridge starts before later Homebrew hooks to reduce cold-start waiting, although Homebrew still starts after LG launches HDMI. It also preserves the active full-screen HDMI input when installing the CEC filter after a cold boot or bridge restart. It fixes a reload that could leave the TV on Home just as picture profiles were restored. The input-only CEC policy means selecting an LG HDMI input can change the TV input without selecting or waking a source device, including through LG's input picker. It also fixes stale and unknown CEC selections that could wake the previous player on a shared HDMI input. Settings capture uses subscriptions, cached descriptions, a shared HDMI video stream, and RAM diagnostics, with a five-minute recovery check. It supports the inspected G6 CEC files from firmware **43.11.73** and **43.21.69**, and fits the normal status view on screen without vertical scrolling. Older C9 firmware is no longer supported. The live verification target is an OLED77G6WUA on **43.21.69 / webOS 11.2.0**, with Homebrew Channel 0.8.0 and Node 20.12.2. Installing the bridge does not update TV firmware.

## Install and receive updates

Add this repository in **Homebrew Channel → Settings → Repositories**:

```text
https://github.com/andrew-kennedy/lg-webos-picture-bridge/releases/latest/download/apps.json
```

Install **LG Picture Bridge** from that repository. Future GitHub releases appear as Homebrew Channel updates. Configuration, MQTT identity, and CEC policy live outside the package and survive app updates. Home Assistant YAML is maintained separately; updating the app does not overwrite your automations.

After upgrading from 0.9.x, use **Restart bridge** in the app once, or reboot the TV, to move the existing supervisor's log and PID file into RAM. Later starts use the RAM paths automatically.

For manual installation, download the IPK from [Releases](https://github.com/andrew-kennedy/lg-webos-picture-bridge/releases), copy it to the TV, and use the ordinary webOS package installer:

```sh
luna-send-pub -i luna://com.webos.appInstallService/dev/install \
  '{"id":"com.ares.defaultName","ipkUrl":"/home/root/io.github.andrewkennedy.lgpicturebridge_0.13.3_all.ipk","subscribe":true}'
```

Wait for `state: installed`, then interrupt the subscription. Homebrew Channel must already be elevated. No system partition flashing is involved.

### Homebrew 0.8.0-rc1 on G6 / Node 20

The tested Homebrew beta can exit while waiting for LG's installer, leaving the UI at **Installing…** or reporting that its service is not running. Its pending LS2 subscription does not keep Node 20 alive. Its idle cleanup also calls an `unregister` method missing from this TV's `webos-service` module.

[The one-time compatibility repair](scripts/fix-homebrew-node20.js) keeps Node alive until Homebrew's existing idle timeout and guards that optional cleanup method. It accepts only the exact tested beta service SHA-256, saves the original under `/home/root`, and refuses unknown or subsequently modified versions. Copy the script to `/home/root/fix-homebrew-node20.js`, close Homebrew Channel, allow its service to idle for 30 seconds, and run over root SSH:

```sh
node /home/root/fix-homebrew-node20.js check
node /home/root/fix-homebrew-node20.js apply
```

Reopen Homebrew Channel. Use `restore` instead of `apply` to undo the repair while the service is stopped. Updating Homebrew itself replaces this local repair; check whether the new version fixes the issue before applying anything else. The repair leaves firmware and root startup unchanged. Installation of the published bridge IPK through the repaired Homebrew service was verified on the G6.

## Pair with Home Assistant

Use [the MQTT pairing script](home-assistant/lg_picture_bridge_mqtt_pairing_script.example.yaml) to send the broker configuration as app launch parameters. Enable picture commands and CEC commands explicitly if you want them. Broker credentials belong in Home Assistant secrets, never in this repository.

Example configuration:

```json
{
  "device_id": "living-room-tv",
  "device_name": "Living Room LG G6",
  "transport": "mqtt",
  "mqtt": {
    "host": "192.168.1.10",
    "port": 1883,
    "username": "tv-bridge",
    "password": "REPLACE_WITH_BROKER_PASSWORD",
    "commands_enabled": true,
    "cec_commands_enabled": true
  }
}
```

When replacing a TV, **reuse the previous `device_id`** to retain MQTT unique IDs and Home Assistant entity IDs. Change `device_name` to the new model. The ID is an opaque identity, not a hardware compatibility setting.

The app shows broker, subscription, command, and CEC status. **Republish discovery** sends discovery and current observations again. **Remove configuration** stops the bridge, disables its CEC overlay, and removes its startup hook.

Discovered entities use these default IDs:

| Entity | Meaning |
| --- | --- |
| `binary_sensor.lg_tv_hdmi_signal` | Confirmed good/bad HDMI video signal |
| `sensor.lg_tv_input` | Active HDMI input |
| `sensor.lg_tv_dynamic_range` | SDR, HDR10, HLG, or Dolby Vision |
| `sensor.lg_tv_picture_mode` | LG picture-mode identifier |
| `sensor.lg_tv_signal_state` | Raw HDMI signal state |
| `sensor.lg_tv_screensaver_type` | LG screensaver reason |
| `sensor.lg_tv_picture_command` | Correlated command results; enabled with picture commands |
| `sensor.lg_tv_cec_filter` / `switch.lg_tv_cec_filter` | CEC policy status and master toggle |
| `number.lg_tv_picture_*` / `select.lg_tv_picture_*` | Active picture settings, with live TV ranges and options |
| `select.lg_tv_sound_*` | Audio settings available with the current sound output |
| `number.lg_tv_other_*` / `select.lg_tv_other_*` | Gaming and HDMI settings |
| `sensor.lg_tv_settings_command` | Setting write/readback results and active context |

A stopped source or lost subscription must not be confused with confirmed no signal. Unknown states stay unknown. Observations are not retained, availability uses a last will, and discovery/state refresh after Home Assistant or broker restarts.

Version 0.9 adds individual settings controls when MQTT commands are enabled. See the [G6 public API audit and control guide](docs/g6-api-capabilities.md) for entity examples, unavailable-mode behavior, and the native sound-output select. Volume, mute, source selection, screen control and sound routing use Home Assistant's non-root webOS integration. This G6 rejects public picture-setting writes, so picture profiles and advanced settings continue through the root bridge.

Version 0.13 makes the **TV the profile owner**. Open **Picture profiles** in this app or in the [LG Picture Profiles Home Assistant companion](https://github.com/andrew-kennedy/home-assistant-lg-picture-profiles) (0.4.0+ recommended). The same editor supports inactive native banks, device bindings, shared Apple TV/Shield presets, room variants, TV-reported slider limits, explicit Save/Restore, and JSON backup import/export. Source/range/ALLM changes still use LG's native mappings; no source-based recipe is reapplied.

Remote and MQTT changes to managed values are temporary. Existing settings subscriptions capture them locally, including while Home Assistant or MQTT is offline. Native TV power notifications and a kernel boot ID identify viewing sessions; a bridge restart or network failure does not end a session. Only confirmed power-off/new boot schedules restoration. Screen Off and Screen Saver remain in the same session. Writes compare current values, validate the native scope and range, and verify readback. A newer concurrent manual edit wins over an older restore.

A complete managed-profile backup is published retained on `<base>/profiles/backup` after changes (500 ms coalescing), power changes, broker reconnect and HA reconnect. It contains the standard document, device bindings, brightness preferences, room state, temporary values and recovery scopes. Home Assistant saves it outside Recorder and acknowledges the exact checksum/instance/sequence on `<base>/profiles/backup/ack`. The backup does not contain broker credentials or unrelated TV system settings. See [profile ownership, recovery, and the backup protocol](docs/profile-ownership.md).

Standards are saved to `profiles.json` only when explicitly edited. `profile-session.json` is a small recovery journal containing dirty key names, pending restores, boot/power state and the last environment. Repeated slider steps change RAM and MQTT, not this journal's values. After a service restart, the bridge reads only dirty banks to reconstruct current adjustments. Runtime diagnostics remain in RAM; no per-adjustment logs or extra recurring settings polls are added. A failed restore uses bounded backoff, stopping after success or power-off.

The `/profiles/command` endpoint retains expiring, session-bound, deduplicated commands. API version 2 adds collection/editor operations. After a collection is imported, legacy policy writes and raw saved-bank apply commands are rejected so a second controller cannot compete with the TV manager. Existing manual setting entities remain temporary controls; HDMI icon commands and CEC/routing continue to work.

## G6 picture profiles and HDMI icons

Use the profile editor and companion for ongoing standards. The [G6 recipe examples](home-assistant/g6/picture_profiles.yaml) are for initial setup before TV ownership is enabled; do not install a competing profile-reapplication automation. The [correlated MQTT transport](home-assistant/lg_picture_bridge_mqtt_command.example.yaml) remains useful for HDMI icon changes.

Movies use Filmmaker Mode (`filmMaker` / `hdrFilmMaker`) for SDR and HDR10/HLG. The room profile updates those banks for daytime or nighttime viewing; Dolby Vision uses Cinema Home by day and Cinema at night. Games use Game Optimizer with SDR, HDR, ALLM, and Dolby Vision mappings. G6 controls include Warm 40 (`colorTemperature: "-40"`), gamma 2.2 (`mediumHavingLevel` with `gammaLevel: 0`), and structured HDMI range values. The source's RGB range must agree with the TV's range selection; HDR games use HGiG by default.

The G6 starting values are informed by [RTINGS' G6 measurements](https://www.rtings.com/tv/reviews/lg/g6-oled/settings) and checked against the TV's own setting descriptions. SDR movies use contrast 95 and black level 50; the integration’s standard-brightness sliders remain editable, with defaults of 100 by day and 3 for a reference dark room. SDR Peak Brightness is High by day and Off at night. HDR retains OLED brightness/contrast 100 and Peak Brightness High. Its daytime boost uses Dynamic Tone Mapping On and Expression Enhancer Brightness (`highlight`); both are Off at night. Dynamic Contrast stays Off. The SDR game brightness slider is independent and defaults to 80. Unit-specific white-balance offsets and color-management calibration values are never copied from the review unit.

The input-mode script uses the same acknowledged MQTT transport to set a physical port's PC, Game Console, or Home Theater icon and label. It does not open a notification or press Enter on the TV. Apply an icon change separately from a picture profile, because the icon may change the picture input dimension to an `_pc` bank.

A picture policy looks like:

```json
{
  "input": "hdmi3",
  "scope": "all",
  "modes": {"sdr": "filmMaker", "hdr": "hdrFilmMaker"},
  "presets": {
    "filmMaker": {"settings": {"backlight": "3", "colorTemperature": "-40"}},
    "hdrFilmMaker": {"settings": {"backlight": "100", "hdrDynamicToneMapping": "off"}}
  }
}
```

`scope: active` requires a current matching HDMI context; `scope: all` configures the supplied banks. `dry_run: true` validates and lists operations without writes. Presets are written before mappings, followed by a non-storing active-context notification when applicable. A failed operation is reported with its index; earlier operations are not automatically rolled back.

An icon command is separate:

```json
{"input":"hdmi1","scope":"all","input_mode":{"icon":"pc","label":"Gaming PC"}}
```

MQTT commands require protocol 1, the current session ID from the command sensor, a unique request ID, and an expiry within 60 seconds. Retained requests are ignored; identical retries do not repeat writes. The Home Assistant script handles the envelope, retries, and correlated result. Broker authentication/ACLs protect this interface. Optional bearer-token HTTP commands and webhooks are still available through the example YAML files.

## CEC automatic-selection filter

[Configure CEC rules from Home Assistant](home-assistant/lg_picture_bridge_mqtt_cec_policy.example.yaml). The bridge has no built-in device identities or block rules. Match explicit input/vendor/name/type fields; every supplied field must match. The master switch preserves the saved rules.

On the inspected G6 firmware, `automatic_selection` rules intercept the HDMI app's automatic CEC selection while allowing explicit device selection. An input-only `device_selection` rule suppresses both paths on that HDMI port, including the device ID LG's input picker supplies. The TV still switches its video input; use source remotes or Home Assistant to wake sources and route an external HDMI switch. Incoming device wake/active-source messages, SIMPLINK audio control, and eARC remain enabled. This is not a general CEC firewall; per-device standby blocking is unsupported.

The filter also suppresses LG's unknown-device fallback when the input contains a device matched by the policy: that fallback can otherwise wake the previously used player behind an HDMI switch. It clears stale explicit-selection state across HDMI minimization while preserving fresh selections. Known unprotected devices continue normally. See [CEC behavior and limitations](docs/cec-filter.md).

The implementation uses a removable bind mount of a generated QML file. It verifies the original `SimplinkController.qml` SHA-256 before applying anything. A 90-second lease and rollback watchdog fail open; unknown firmware, missing policy, ambiguous identities, and expired leases preserve LG behavior. Stop/unpair revokes the lease and removes the owned overlay. Firmware updates may change the file hash and disable filtering until that firmware is inspected.

## G6 implementation and verification

The G6 uses:

- `com.webos.applicationManager/getForegroundAppInfo` and the active HDMI `MAIN` client from `com.webos.service.videooutput/getStatus` to identify a pipeline.
- `com.webos.service.extinputs.hdmi/getSignalState` with **`pipelineId`** for actual signal state. A connected video output is not proof of signal.
- `com.webos.settingsservice/getSystemSettings`, subscribed to `pictureMode`, for picture dimensions.
- `picture$input.mode.x` for preset controls and `picture$input.x.range` for mode mappings. There is no 3D dimension on this model.
- An explicit LS2 API permission for app-to-service status/configuration calls.

Tests cover stale sessions, ambiguous MAIN clients, signal loss, coherent HLG/HDR telemetry, command expiry/replay, correlated failures, bounded input-mode commands, and CEC lease expiry/explicit-selection bypass. The live checks cover application status, MQTT discovery, inactive-bank write/readback, profile commands, and the mounted CEC filter. HDR/Dolby Vision content transitions still need representative playback on the attached sources; successful bank writes alone do not prove every source's output mode.

Persistent configuration is in `/var/lib/io.github.andrewkennedy.lgpicturebridge/`, with a startup hook at `/var/lib/webosbrew/init.d/45-lg-picture-bridge`. `config.json` contains credentials and is mode 0600. Runtime health, logs, and the PID file are in `/tmp/io.github.andrewkennedy.lgpicturebridge/`, which is RAM-backed on the supported G6. Health updates are coalesced with a one-second deadline; the process heartbeat remains every 30 seconds. Logs contain startup/shutdown and errors, not routine observations or successful setting writes. When the log exceeds 64 KiB, it is trimmed to its newest 32 KiB. Runtime diagnostics disappear on reboot; configuration and CEC preferences persist. Upgrades still recognize the old persistent PID file so the previous supervisor can be stopped safely.

```sh
npm ci
npm test
npm run test:layout
npm run validate
npm run build
npm run manifest
npm run site
```

Tagging a tested version as `vX.Y.Z` runs the release workflow, publishes the IPK/manifest/feed, and updates GitHub Pages. The feed requires webOS 11 or later; the verified CEC hash remains firmware-specific.
