# LG Picture Bridge

LG Picture Bridge connects a **rooted 2026 LG G6 (webOS 11)** to Home Assistant. It reports HDMI signal presence, input, picture mode, and SDR/HDR10/HLG/Dolby Vision through MQTT discovery, and applies picture profiles without notification dialogs.

Version **0.9.5** removes the Energy Saving Step, Minimum Brightness and Motion Eye Care controls. The included movie and game profiles keep picture energy saving off. Numeric MQTT settings remain sliders with the TV's live limits. It supports the inspected G6 CEC files from firmware **43.11.73** and **43.21.69**, and fits the normal status view on screen without vertical scrolling. Older C9 firmware is no longer supported. The live verification target is an OLED77G6WUA on **43.21.69 / webOS 11.2.0**, with Homebrew Channel 0.8.0-rc1 and Node 20.12.2. Installing the bridge does not update TV firmware.

## Install and receive updates

Add this repository in **Homebrew Channel → Settings → Repositories**:

```text
https://github.com/andrew-kennedy/lg-webos-picture-bridge/releases/latest/download/apps.json
```

Install **LG Picture Bridge** from that repository. Future GitHub releases appear as Homebrew Channel updates. Configuration, MQTT identity, and CEC policy live outside the package and survive app updates. Home Assistant YAML is maintained separately; updating the app does not overwrite your automations.

For manual installation, download the IPK from [Releases](https://github.com/andrew-kennedy/lg-webos-picture-bridge/releases), copy it to the TV, and use the ordinary webOS package installer:

```sh
luna-send-pub -i luna://com.webos.appInstallService/dev/install \
  '{"id":"com.ares.defaultName","ipkUrl":"/home/root/io.github.andrewkennedy.lgpicturebridge_0.9.5_all.ipk","subscribe":true}'
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

Version 0.9 adds individual settings controls when MQTT commands are enabled. See the [G6 public API audit and control guide](docs/g6-api-capabilities.md) for entity examples, unavailable-mode behavior, and the native sound-output select. Volume, mute, source selection, screen control and sound routing use Home Assistant's non-root webOS integration. This G6 rejects public picture-setting writes, so picture profiles and advanced settings continue through the root bridge. Manual edits may be reapplied by the existing source/day/night profile automations.

## G6 picture profiles and HDMI icons

Install [the correlated MQTT command script](home-assistant/lg_picture_bridge_mqtt_command.example.yaml), then merge [the G6 profile scripts](home-assistant/g6/picture_profiles.yaml) into `scripts.yaml`. Change their TV entity default to your installation. Create the three OLED-light number helpers used by the profiles: `lg_movie_bright_sdr_oled_light`, `lg_movie_dark_sdr_oled_light`, and `lg_game_sdr_oled_light`. The dispatcher expects `input_select.lg_tv_picture_write_backend` to be `rooted_bridge`.

Movies use Filmmaker Mode (`filmMaker` / `hdrFilmMaker`) for SDR and HDR10/HLG. The room profile updates those banks for daytime or nighttime viewing; Dolby Vision uses Cinema Home by day and Cinema at night. Games use Game Optimizer with SDR, HDR, ALLM, and Dolby Vision mappings. G6 controls include Warm 40 (`colorTemperature: "-40"`), gamma 2.2 (`mediumHavingLevel` with `gammaLevel: 0`), and structured HDMI range values. The source's RGB range must agree with the TV's range selection; HDR games use HGiG by default.

The G6 starting values are informed by [RTINGS' G6 measurements](https://www.rtings.com/tv/reviews/lg/g6-oled/settings) and checked against the TV's own setting descriptions. SDR movies use contrast 95 and black level 50; the brightness helpers remain editable, with fallbacks of 100 by day and 3 for a reference dark room. SDR Peak Brightness is High by day and Off at night. HDR retains OLED brightness/contrast 100 and Peak Brightness High. Its daytime boost uses Dynamic Tone Mapping On and Expression Enhancer Brightness (`highlight`); both are Off at night. Dynamic Contrast stays Off. The game brightness helper is independent and defaults to 80. Unit-specific white-balance offsets and color-management calibration values are never copied from the review unit.

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

On the inspected G6 firmware the filter intercepts the HDMI app's **automatic CEC device selection**. Explicit device selection continues normally. This is not a general CEC firewall, and per-device standby blocking is not supported. SIMPLINK and eARC remain enabled.

The implementation uses a removable bind mount of a generated QML file. It verifies the original `SimplinkController.qml` SHA-256 before applying anything. A 90-second lease and rollback watchdog fail open; unknown firmware, missing policy, ambiguous identities, and expired leases preserve LG behavior. Stop/unpair revokes the lease and removes the owned overlay. Firmware updates may change the file hash and disable filtering until that firmware is inspected.

## G6 implementation and verification

The G6 uses:

- `com.webos.applicationManager/getForegroundAppInfo` and the active HDMI `MAIN` client from `com.webos.service.videooutput/getStatus` to identify a pipeline.
- `com.webos.service.extinputs.hdmi/getSignalState` with **`pipelineId`** for actual signal state. A connected video output is not proof of signal.
- `com.webos.settingsservice/getSystemSettings`, subscribed to `pictureMode`, for picture dimensions.
- `picture$input.mode.x` for preset controls and `picture$input.x.range` for mode mappings. There is no 3D dimension on this model.
- An explicit LS2 API permission for app-to-service status/configuration calls.

Tests cover stale sessions, ambiguous MAIN clients, signal loss, coherent HLG/HDR telemetry, command expiry/replay, correlated failures, bounded input-mode commands, and CEC lease expiry/explicit-selection bypass. The live checks cover application status, MQTT discovery, inactive-bank write/readback, profile commands, and the mounted CEC filter. HDR/Dolby Vision content transitions still need representative playback on the attached sources; successful bank writes alone do not prove every source's output mode.

Runtime files are in `/var/lib/io.github.andrewkennedy.lgpicturebridge/`, with a startup hook at `/var/lib/webosbrew/init.d/55-lg-picture-bridge`. `config.json` contains credentials and is mode 0600. `health.json` and `bridge.log` help diagnose problems without exposing broker passwords.

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
