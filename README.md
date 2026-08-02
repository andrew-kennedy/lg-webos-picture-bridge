# LG Picture Bridge

LG Picture Bridge is a small Homebrew app for rooted LG webOS TVs. It watches the TV's private
picture-dimension Luna service, reports context transitions to Home Assistant, and accepts narrowly
scoped authenticated picture-policy commands from the local network.

It is intended for automations that need to reapply the currently active picture preset when an
Apple TV, Shield, game console, or PC changes between SDR, HDR10, HLG, and Dolby Vision. It does
not capture video, drive LEDs, or require HyperHDR.

> [!IMPORTANT]
> Version 0.3.0 is live-tested on a rooted 2019 LG C9 running webOS 4.x. It receives
> `dimension.dynamicRange`, delivers C9 webhook observations to Home Assistant, and silently writes
> active and inactive picture banks through LG's firmware-specific synthetic categories. The
> documented `dimension` request object is not used because this C9 returned `no result from DB`.

## Install from Homebrew Channel

Open **Homebrew Channel → Settings → Add repository** and enter this exact URL:

```text
https://github.com/andrew-kennedy/lg-webos-picture-bridge/releases/latest/download/apps.json
```

Return to the app browser, install **LG Picture Bridge**, and launch it once. Homebrew Channel must
show **Root status: ok** because the monitor needs private Luna access and a startup hook.

When upgrading, install the update and re-run the supplied pairing script once to enable the new
authenticated command API. Existing pairing data remains outside the application directory.

The release workflow also deploys a browsable GitHub Pages site. The release URL above always
selects the latest tagged feed and remains independent of account-level Pages custom-domain
redirects and branch-content cache delays.

## Configure Home Assistant

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

The script uses `webostv.command` to launch the app with a `callback_url` parameter. The app stores
the configuration, starts its monitor, and sends a test event. Nothing needs to be typed with the TV
remote.

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
  "bridge_version": "0.3.0"
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
  "bridge_version": "0.3.0"
}
```

`dynamic_range` is one of `sdr`, `hdr10`, `hlg`, or `dolby_vision`. The raw LG value is retained for
diagnostics.

## Direct picture-policy commands

Merge
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
requested physical input does not match. Add `"dry_run": true` to validate and list operations
without writing anything.

On the tested C9, preset controls use `picture$input.pictureMode.2d.x`, while range selections use
`picture$input.x.2d.dynamicRange`. Preset controls are written before mode mappings so the visible
picture switches only after its destination preset is ready.

## How it works

```text
settingsservice picture subscription ──> debounce + normalize ──> HA webhook
                  dimension.dynamicRange                         │
                                                                ▼
settingsservice synthetic categories <── authenticated policy API
```

The IPK includes a registered JavaScript Luna service named
`io.github.andrewkennedy.lgpicturebridge.service`. A narrow installed role permits outbound calls
only to `com.webos.settingsservice` and the optional `com.webos.service.videooutput` fallback.
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

The callback URL and command token are stored in `config.json` with mode `0600` when supported. The
app status screen always redacts secrets. It reports each subscription's actual state, current
picture context, command-API state, last detected dynamic range, last command, and last webhook
result; a running supervisor alone is not shown as healthy.

## Troubleshooting

- **Pairing fails immediately:** confirm Homebrew Channel reports `Root status: ok`.
- **Test event fails:** use a Home Assistant URL reachable directly from the TV. `homeassistant.local`
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

To remove the persistent configuration, open the app and select **Clear pairing** before uninstalling.

## Development

Requirements: Node.js 20+, npm, and the tools needed by `@webos-tools/cli`.

```sh
npm ci
npm test
npm run validate
npm run build
npm run manifest
npm run site
```

The IPK and release manifest are written to `dist/`. Tagged releases matching `v*` publish those
artifacts and deploy `site/` to GitHub Pages. `app/appinfo.json` and `package.json` must have matching
versions before tagging.

## Security model

- The bridge accepts only HTTP(S) callback URLs without embedded credentials.
- The LAN command endpoint requires a 24-character-or-longer bearer token and exposes only status
  and a schema-validated `picture` policy route; it cannot invoke arbitrary Luna URIs or categories.
- Picture setting keys, input names, mode names, body size, nesting, and command queue length are
  bounded before a request reaches Luna.
- The installed Luna role restricts outbound calls to settingsservice and the optional read-only
  video-output monitor.
- Pairing payloads are validated before being written.
- The webhook sends observations only; it does not accept commands from Home Assistant.
- Home Assistant should keep the webhook local-only and use a unique, non-guessable ID.

## License

MIT
