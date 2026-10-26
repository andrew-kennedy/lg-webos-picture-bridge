# LG G6 API audit and Home Assistant controls

The full audit ran on an OLED77G6WUA, firmware **43.11.73**, webOS **11.1.0-4407**, on 2026-10-26, using the existing Home Assistant pairing and the current aiowebostv registration permissions. Results describe this pairing and firmware; they are not a model-wide guarantee.

After the same TV's USB upgrade to **43.21.69 / webOS 11.2.0**, spot checks confirmed that native audio status/output and public picture-mode reads still work. A same-value public picture-mode write still returned **401 insufficient permissions**, so picture profiles continue using the root bridge. The full 95-setting audit below remains the original 43.11.73 measurement.

## Public API results

| Interface | Result on this TV | Home Assistant path |
| --- | --- | --- |
| Volume, mute, sound output | Reads and same-value writes succeeded | Built-in webOS integration; native sound-output select below |
| Screen off/on | Both succeeded; screen restored immediately | Existing webOS screen switch |
| Apps, input list, foreground app, power state, media foreground, connection info, channel list | Read succeeded | Built-in webOS integration / `webostv.command` |
| `settings/getSystemSettings` | 31 of the 95 setting candidates audited for v0.9.0 readable individually | Public reads do not imply write permission |
| `settings/currentSystemSettings`, `config/getConfigs` | Read succeeded | Diagnostics; not an unrestricted configuration writer |
| `settings/setSystemSettings` | **401 insufficient permissions**, including a same-value picture-mode write | Root bridge |
| `externalpq/setExternalPqData` | **401** for OLED brightness, contrast, black level and color UI commands | Root bridge; no calibration session started |
| `com.webos.service.eim/setDeviceInfo` over SSAP | **401** for the existing HDMI 1 PC icon/label | Existing bounded bridge input-mode script |
| `com.webos.settingsservice/getSystemSettings` / `setSystemSettings` over SSAP | **404**, internal Luna paths are not public SSAP paths | Root bridge |
| Software info | **401** | Root/local diagnostics |
| App status / launcher app state | **404 / 403** | Not exposed as working controls |

`getCurrentChannel` returned an application error while using HDMI. `turnOnScreen` also returns an application error if the screen is already on; the off/on round trip succeeded. An unrecognized calibration read command reached the driver and failed; this is **not** evidence of usable calibration reads. Power cycling, channel changes, media interruption, factory operations and calibration uploads were not swept through as tests. The G6 has no 3D feature to expose.

The old C9 is no longer available for a matching live test. These measurements do not show a new public picture-writing capability to replace the rooted profile bridge. Standard remote controls remain on Home Assistant's paired SSAP connection. No alert-based Luna workaround is used.

Sources: [aiowebostv endpoints](https://github.com/home-assistant-libs/aiowebostv/blob/main/aiowebostv/endpoints.py), [registration permissions](https://github.com/home-assistant-libs/aiowebostv/blob/main/aiowebostv/handshake.py), [bscpylgtv command implementation](https://github.com/chros73/bscpylgtv/blob/master/bscpylgtv/webos_client.py), [Home Assistant webOS integration](https://www.home-assistant.io/integrations/webostv/). The [per-setting public-read audit](g6-public-settings-audit.json) records accepted and rejected keys without pairing keys or personal device details.

## Settings entities

With `mqtt.commands_enabled: true`, the bridge discovers number and select entities for the reviewed picture, sound, gaming and HDMI catalog, plus the optional native sound-output select. Actual counts and availability depend on the active mode and firmware descriptions.

Examples:

| Entity | Control |
| --- | --- |
| `number.lg_tv_picture_backlight` | OLED pixel brightness |
| `number.lg_tv_picture_brightness` | Black level |
| `select.lg_tv_picture_picturemode` | Picture mode for the current dynamic range |
| `select.lg_tv_picture_hdrdynamictonemapping` | HDR tone mapping, including HGiG when offered |
| `select.lg_tv_picture_trumotionmode` | TruMotion for the active HDMI application |
| `select.lg_tv_other_gameoptimization` | VRR / G-Sync for the active HDMI port |
| `select.lg_tv_other_freesync` | FreeSync for the active HDMI port |
| `select.lg_tv_other_qmsvrr` | Quick Media Switching |
| `select.lg_tv_sound_soundoutputdigital` | PCM / Auto / Pass Through |
| `sensor.lg_tv_settings_command` | Correlated results, active context and control counts |

The TV supplies current values, ranges, choices and active/visible flags. Numeric controls use Home Assistant's MQTT slider mode, preserving each live minimum, maximum and step rather than assuming a 0–100 scale. For example, this G6 reports sharpness as 0–50, color temperature as −50–50, gamma level as −3–3, and stabilizers as 0–20. Unsupported or mode-inapplicable controls are unavailable. Picture and dimension-dependent controls require a confirmed active HDMI picture. App-specific values are read separately and written to the captured application ID. Global audio settings remain usable without an HDMI picture. Controls refresh every ten seconds and after writes or input/mode changes.

Unchanged control observations are not repeatedly published, avoiding needless Home Assistant recorder updates. Discovery and values are republished when Home Assistant or the broker reconnects.

Commands use the existing expiring, non-retained, session-bound MQTT protocol, with an additional context token. Input/mode changes reject stale commands. Manual setting writes and profile writes share one queue. A successful setter is followed by a value readback before reporting completion; Home Assistant is not optimistic. These controls target the active context; the existing profile scripts still handle multiple inactive SDR/HDR/Dolby Vision banks.

Live end-to-end checks covered a Home Assistant OLED-brightness change from 80 to 79 and back, same-value TruMotion/QMS/digital-output writes, and the native sound-output select. All bridge checks returned correlated success with TV readback. Automations and the foreground application were restored afterward. The remaining controls are validated against live descriptions and values, but every possible option on every attached source has not been exercised.

Manual changes can be overwritten when the existing source, dynamic-range or day/night automation reapplies a profile. Change the profile or brightness helper for a lasting automated preference.

The catalog deliberately omits LG Sound Sync, Sound Optimizer, Sound Mode Sync, sound mode, Dolby Atmos support, virtual surround, eARC, AI Sound, AI Game Sound and Clear Voice controls, along with AV-sync, audio-balance, pointer, accessibility, sign-language, startup and other set-once convenience controls. Upgrades remove their old Home Assistant discovery entries without changing the underlying TV settings. Turning off AI audio processing is a separate TV preference, not a side effect of installing this app. The catalog also omits service-menu operations, firmware settings, reset actions, private/account settings, calibration LUTs, white-balance fine adjustments, CMS and compound object/array editors. The existing profile API still handles structured HDMI RGB range. Discovery never copies RTINGS' panel-specific calibration values or changes a setting just by discovering it.

## Native audio control

Install [native_controls.yaml](../home-assistant/g6/native_controls.yaml) as a Home Assistant package and reload templates. `select.lg_tv_sound_output` calls `webostv.select_sound_output` through the paired non-root connection and follows the media player's actual reported output. `external_arc` is the Sonos/eARC output. Bluetooth choices require a paired device.

Keep using `media_player.living_room_lg_webos_tv` for inputs, playback, volume and mute, its existing screen switch, and `button.living_room_wake_on_lan_lg_tv` for wake-up. These controls do not need the root bridge.
