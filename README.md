# LG Picture Bridge

LG Picture Bridge is a small Homebrew app for rooted LG webOS TVs. It watches the TV's private
picture-dimension Luna service, reports context transitions to Home Assistant, and accepts narrowly
scoped picture-policy commands from the local network. Version 0.5 uses Home Assistant MQTT
discovery for both observations and confirmed picture commands: no webhook or HA REST package is
required. Event-driven HDMI signal presence is independent of the selected TV input.

It is intended for automations that need to reapply the currently active picture preset when an
Apple TV, Shield, game console, or PC changes between SDR, HDR10, HLG, and Dolby Vision. It does
not capture video, drive LEDs, or require HyperHDR.

An [SSH-only, time-limited Apple TV CEC experiment](experiments/apple-tv-cec/README.md) is available
for development on the inspected C9 firmware. It is **not** part of the installed app, not a
general CEC filter, and never runs automatically. It uses a temporary overlay rather than
overwriting firmware; successful behavior must be established before any bridge/UI integration.

> [!IMPORTANT]
> Version 0.5.0 is live-tested on a rooted 2019 LG C9 running Node 0.12.2 with Home Assistant
> 2026.9.3. MQTT discovery, request/reply picture writes, TV readback, and the existing movie
> automation were verified without the HA REST package. The writer uses LG's firmware-specific
> synthetic categories (active/inactive banks were first verified in 0.3). After an
> active-bank write, it sends an explicit, non-storing `dimension` notification so the C9 reloads
> the picture-processing pipeline immediately instead of waiting for a manual picture-mode cycle.

## Install from Homebrew Channel

Open **Homebrew Channel → Settings → Add repository** and enter this exact URL:

```text
https://github.com/andrew-kennedy/lg-webos-picture-bridge/releases/latest/download/apps.json
```

Return to the app browser, install **LG Picture Bridge**, and launch it once. Homebrew Channel must
show **Root status: ok** because the monitor needs private Luna access and a startup hook.

When upgrading, existing configuration remains outside the application directory. MQTT commands
are opt-in: enable `mqtt.commands_enabled: true` using the MQTT pairing script or protected SSH
configuration. Existing HTTP commands and webhook-only configurations remain supported.

The release workflow also deploys a browsable GitHub Pages site. The release URL above always
selects the latest tagged feed and remains independent of account-level Pages custom-domain
redirects and branch-content cache delays.

## Configure Home Assistant

### MQTT discovery (recommended for new setups)

Use [Configure LG Picture Bridge MQTT](home-assistant/lg_picture_bridge_mqtt_pairing_script.example.yaml)
to send broker settings from Home Assistant to the TV app. Keep the username/password in HA secrets.
No webhook URL or Home Assistant access token is required. The bridge saves configuration and runs
in the background after the app closes. **Already configured? An app update does not require setup
again.** Setup replaces saved configuration; do not run the old webhook-only script over an MQTT
installation. Preserve the existing `device_id` when changing settings to keep entity identities.

See [MQTT setup and migration](docs/mqtt.md). The bridge publishes one MQTT device with:

| Default entity ID | Meaning |
| --- | --- |
| `binary_sensor.lg_tv_hdmi_signal` | Current HDMI session has valid video; unknown is not off |
| `sensor.lg_tv_input` | Active physical HDMI input (`hdmi1`…`hdmi4`) |
| `sensor.lg_tv_dynamic_range` | SDR/HDR10/HLG/Dolby Vision; unknown without valid signal |
| `sensor.lg_tv_picture_mode` | Selected picture preset, including while the input has no signal |
| `sensor.lg_tv_signal_state` | Diagnostic firmware value, e.g. `good` or `bad` |
| `sensor.lg_tv_screensaver_type` | Diagnostic firmware value, e.g. `NO_SIGNAL` |
| `sensor.lg_tv_picture_command` | Opt-in command readiness and correlated success/error results |

All entities share bridge availability. With MQTT commands enabled, install the
[`lg_tv_mqtt_picture_policy` script](home-assistant/lg_picture_bridge_mqtt_command.example.yaml)
and send the same policy object through it. It discovers the command topic/session from the status
sensor and waits for the matching application-level result. A broker publish alone is not success.
Keep source routing, game/movie recipes, and the backend-selection helper unchanged; only replace
the HTTP action inside the picture-policy facade:

```yaml
- action: script.lg_tv_mqtt_picture_policy
  data:
    policy: "{{ bridge_policy_json }}"
  response_variable: picture_bridge_response
- if: >-
    {{ picture_bridge_response is not mapping
       or picture_bridge_response.get('ok') != true }}
  then:
    - stop: MQTT picture policy was not confirmed; inspect the command script trace
      error: true
```

After a successful dry run and live test, remove the old `rest_command` entry (or its dedicated HA
package) and reload REST commands. Keep unrelated package contents. The optional HTTP endpoint on
the TV can remain as a rollback path; it is not used by this script. There is no automatic fallback
after an MQTT timeout because some writes may already have applied.

These are batched recipe commands, not separate sliders for every LG setting. The result sensor
reports Luna completion/error, not a calibrated measurement of the panel. See
[the MQTT command protocol](docs/mqtt.md#picture-policy-commands) for limits and security.

### TV status screen (0.5.1+)

The screen refreshes every five seconds while visible. **Configured** means settings were saved;
**broker connected** means the MQTT connection is up; **MQTT listener ready** means the broker
accepted the picture-command subscription, not that a picture command has run. If an optional HTTP
endpoint is configured, its status is shown separately. No credentials are displayed.

Version **0.5.2** fixes controls falling below the screen on older TVs. The C9's
[webOS 4.x engine is Chromium 53](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine),
which predates CSS Grid. The status screen now uses compatible flex columns and spacing,
keeps actions inside a five-percent screen-safe border, and scrolls long status/errors
above the action bar. Use **Up/Down** to scroll, **Left/Right** to choose an action, and
**OK** to select. Pointer/wheel and keyboard access also work. MQTT, picture policies,
CEC settings, and saved configuration are unchanged; no reconfiguration is needed.

Live C9 verification: the original Chromium 53 page was 1141 px tall at a 1920×1080
viewport, with buttons ending at 1107 px. With 0.5.2 installed, the page is exactly
1080 px tall and buttons end at 990 px or above. Left/Right focus navigation worked
on the TV; the saved configuration checksum was unchanged and MQTT reconnected.

- **Refresh status** reads the bridge's current status.
- **Restart monitor** restarts the background service without changing saved settings.
- **Republish discovery** submits MQTT discovery, the current state, availability and enabled
  command status again. It does not change picture settings. Disconnected/failed submissions report
  an error; QoS 0 submission does **not** confirm broker or HA receipt. Check entities in HA for that.
- Webhook-only setups show **Send webhook test**; mixed setups show **Republish + test webhook**.
  An HTTP response is reported separately and does not prove an HA automation ran.
- **Remove configuration** asks for confirmation, stops monitoring, removes saved configuration
  and the startup hook. It does not delete retained MQTT discovery or entities from HA; remove those
  separately if retiring the bridge. Ordinary upgrades do not need this action.

### Legacy webhook setup

### 1. Create a random local webhook

Generate a unique webhook ID, for example with `openssl rand -hex 32`. Copy
[`home-assistant/lg_picture_bridge_automation.example.yaml`](home-assistant/lg_picture_bridge_automation.example.yaml)
into Home Assistant and replace `REPLACE_WITH_THE_SAME_RANDOM_WEBHOOK_ID`.

The example webhook is `local_only: true`. Home Assistant recommends treating a webhook ID like a
password; do not commit your real value to this repository or expose the endpoint to the internet.

The example emits `lg_picture_bridge_dynamic_range_changed` without assuming a particular source
policy. Add your existing game/movie profile dispatcher after that event, or consume the event in a
separate automation.

### 2. Add the pairing script

Copy [`home-assistant/lg_picture_bridge_pairing_script.example.yaml`](home-assistant/lg_picture_bridge_pairing_script.example.yaml)
into `scripts.yaml`, or recreate it in the UI. Run **Pair LG Picture Bridge** and provide:

- the Home Assistant URL reachable from the TV, such as `http://10.0.0.4:8123`;
- the same random webhook ID;
- an optional command token (leaving it empty reuses the webhook ID);
- the LG webOS media-player entity.

The script uses `webostv.command` to launch the app with a `callback_url` parameter. The app sends
the validated configuration directly to its narrowly scoped registered service, starts its monitor,
and sends a test event. Pairing and status no longer depend on Homebrew Channel's generic shell-exec
API, and nothing needs to be typed with the TV remote.

The app also accepts split launch parameters:

```json
{
  "home_assistant_url": "http://10.0.0.4:8123",
  "webhook_id": "a-long-random-value",
  "device_id": "living-room-c9",
  "device_name": "Living Room C9",
  "debounce_ms": 500,
  "command_token": "another-random-value-at-least-24-characters",
  "command_port": 49191
}
```

or a nested `setup` object containing the same fields. A complete `callback_url` takes precedence.

## Webhook payloads

Successful pairing sends:

```json
{
  "event": "pairing_test",
  "dynamic_range": null,
  "device_id": "living-room-c9",
  "device_name": "Living Room C9",
  "bridge_version": "0.3.3"
}
```

A signal transition sends:

```json
{
  "event": "dynamic_range_changed",
  "dynamic_range": "dolby_vision",
  "previous_dynamic_range": "sdr",
  "input": "hdmi3",
  "previous_input": "hdmi3",
  "picture_mode": "dolbyHdrCinema",
  "source": "picture",
  "raw_value": "dolbyHdr",
  "observed_at": "2026-08-01T15:30:00.000Z",
  "device_id": "living-room-c9",
  "device_name": "Living Room C9",
  "bridge_version": "0.3.3"
}
```

`dynamic_range` is one of `sdr`, `hdr10`, `hlg`, or `dolby_vision`. The raw LG value is retained for
diagnostics.

## Picture-policy payload (MQTT or optional HTTP)

MQTT is the recommended command transport. The policy schema below is shared by both transports.
For optional HTTP access, merge
[`home-assistant/lg_picture_bridge_rest_command.example.yaml`](home-assistant/lg_picture_bridge_rest_command.example.yaml)
into Home Assistant and store the same pairing token in `secrets.yaml` with the `Bearer ` prefix.
Home Assistant sends one policy object to:

```text
POST http://TV_IP:49191/v1/picture/policy
Authorization: Bearer RANDOM_TOKEN
```

For example:

```json
{
  "request_id": "apple-tv-dark",
  "input": "hdmi3",
  "scope": "active",
  "modes": {
    "sdr": "expert2",
    "sdrALLM": "expert2",
    "hdr": "hdrCinema",
    "hdrALLM": "hdrCinema",
    "dolbyHdr": "dolbyHdrCinema",
    "dolbyHdrALLM": "dolbyHdrCinema"
  },
  "presets": {
    "expert2": {
      "settings": {"backlight": 35, "gamma": "medium"},
      "current_app_settings": {"truMotionMode": "off"}
    },
    "hdrCinema": {"settings": {"backlight": 100}},
    "dolbyHdrCinema": {"settings": {"backlight": 100}}
  }
}
```

Use `scope: all` when a source, room profile, or shared HDMI-switch role changes. It preloads every
supplied preset and range mapping. Use `scope: active` after a signal transition; the bridge reads
the TV's current raw range, applies only its matching preset and mapping, and returns HTTP 409 if the
requested physical input does not match (MQTT returns a correlated `stale_input` error instead).
Add `"dry_run": true` to validate without writing anything; MQTT replies with the planned operation
count and HTTP additionally lists the operations. Automatic content transitions should use
`scope: active`; a manual preload can still use `all`.

On the tested C9, preset controls use `picture$input.pictureMode.2d.x`, while range selections use
`picture$input.x.2d.dynamicRange`. Preset controls are written before mode mappings so the visible
picture switches only after its destination preset is ready. If that input and dynamic-range bank
is currently active, the bridge finishes with a base `picture` write containing the explicit
`input`, `dynamicRange`, and `_3dStatus` dimensions plus `store: false` and `notify: true`. This
forces webOS to reload the already-stored profile without an alert, ENTER press, or temporary mode
cycle. Inactive inputs remain preload-only and activate normally when selected.

## How it works

```text
TV picture + signal subscriptions ──> MQTT discovery sensors ──> HA picture dispatcher
                                                                     │
TV settingsservice <── shared policy writer <── MQTT command <── game/movie recipe
                               └── MQTT command-status results ──> waiting HA script
```

The IPK includes a registered JavaScript Luna service named
`io.github.andrewkennedy.lgpicturebridge.service`. A narrow installed role permits outbound calls
to `com.webos.settingsservice`, the optional `com.webos.service.videooutput` fallback, and the
read-only foreground-session and HDMI signal methods on `com.webos.service.acb` and
`com.webos.service.tv.externaldevice`.
Homebrew Channel's elevated JS-service runner launches it outside the normal third-party jail.
[LG ships Node.js 0.12.2 on webOS TV 4.x](https://webostv.developer.lge.com/develop/guides/js-service-basics);
the monitor is deliberately written to that older JavaScript runtime.
It creates this startup hook:

```text
/var/lib/webosbrew/init.d/55-lg-picture-bridge
```

Configuration and logs are stored outside the application directory:

```text
/var/lib/io.github.andrewkennedy.lgpicturebridge/config.json
/var/lib/io.github.andrewkennedy.lgpicturebridge/health.json
/var/lib/io.github.andrewkennedy.lgpicturebridge/bridge.log
```

Broker credentials, the callback URL and any HTTP command token are stored in `config.json` with
mode `0600` when supported. The app status screen redacts secrets and shows subscription states,
command transport readiness, the last observed signal and reporting status. A running supervisor
alone is not shown as healthy. Detailed command results remain available in the MQTT command sensor.

## Troubleshooting

- **Configuration fails immediately:** confirm Homebrew Channel reports `Root status: ok` and install at
  least version 0.3.2, which grants the web app its required Luna client permissions and talks
  directly to the registered bridge service.
- **MQTT republish fails:** check the broker address, credentials, connection and ACLs. Discovery is
  republished automatically after reconnecting. A saved configuration alone does not mean connected.
- **Legacy webhook test fails:** use a Home Assistant URL reachable directly from the TV. `homeassistant.local`
  may not resolve on older webOS versions; a reserved LAN IP is safer.
- **The monitor stops after a reboot:** launch Homebrew Channel once and verify its root startup hook
  is current. Then open LG Picture Bridge and select **Refresh status**.
- **After upgrading from 0.1 or 0.2:** re-run the pairing script once with a command token, then
  confirm the TV app reports the picture command API as `listening`.
- **No format changes arrive:** select **Refresh status**. At least one Luna subscription must show
  `subscribed` or `responding`; inspect `bridge.log` over SSH for its exact error or payload.
- **`videooutput` says unavailable:** this is expected on the tested C9 when the picture subscription
  is subscribed. The bridge needs only one working source, and the C9 publishes
  `dimension.dynamicRange` through `com.webos.settingsservice`.
- **HTTPS fails on an older TV:** use an isolated local HTTP URL or a reverse proxy compatible with
  the TV's older TLS stack. Keep the webhook local-only.
- **A picture command returns HTTP 409:** the active physical input or dynamic range changed before
  the request arrived. Let the newest bridge event retry with the current context.
- **A picture command returns HTTP 502:** inspect the returned Luna error and failed category. An
  unsupported setting key or picture-mode name can cause the C9 to reject that operation.

To remove the persistent configuration, open the app and confirm **Remove configuration** before uninstalling.

## Development

Requirements: Node.js 20+, npm, and the tools needed by `@webos-tools/cli`.

```sh
npm ci
npm test
npx playwright install chromium
npm run test:layout
npm run validate
npm run build
npm run manifest
npm run site
```

The IPK and release manifest are written to `dist/`. Tagged releases matching `v*` publish those
artifacts and deploy `site/` to GitHub Pages. `app/appinfo.json` and `package.json` must have matching
versions before tagging.

Layout checks cover 1080p, 720p, and smaller viewports with normal/mixed transport,
unconfigured state, long errors, larger text, and remote navigation. They use modern
Chromium for geometry plus static checks for unsupported C9 CSS, not a webOS emulator.
Set `LAYOUT_CHROMIUM_PATH` to reuse an existing Chromium executable if needed.

## Security model

- The bridge accepts only HTTP(S) callback URLs without embedded credentials.
- The LAN command endpoint requires a 24-character-or-longer bearer token and exposes only status
  and a schema-validated `picture` policy route; it cannot invoke arbitrary Luna URIs or categories.
- Picture setting keys, input names, mode names, body size, nesting, and command queue length are
  bounded before a request reaches Luna.
- The installed Luna role restricts outbound calls to settingsservice, the optional read-only
  video-output monitor, and the foreground/HDMI signal services. Runtime LS2 sender checks limit pairing/status methods to the LG Picture
  Bridge app itself.
- Pairing payloads are validated before being written.
- The webhook sends observations only; it does not accept commands from Home Assistant.
- Home Assistant should keep the webhook local-only and use a unique, non-guessable ID.
- MQTT credentials are stored only in the protected configuration, never in discovery messages or
  status output. Commands are disabled by default. Enabling them trusts broker authentication and
  topic ACLs to authorize picture changes; the HTTP token does not authorize MQTT messages. Use a
  private broker and dedicated account/ACLs where possible. No shell or arbitrary Luna command
  endpoint is exposed.
- MQTT commands require a current connection session, a request ID and a short expiry. Retained
  deliveries are ignored; exact retries are deduplicated. Guards run before each write. A context
  change/failure can leave partial writes; it is not a transaction and there is no blind fallback.

## License

MIT
