# LG Picture Bridge

LG Picture Bridge is a small Homebrew app for rooted LG webOS TVs. It watches the TV's private
video-output and picture-dimension Luna services and reports dynamic-range transitions to a local
Home Assistant webhook.

It is intended for automations that need to reapply the currently active picture preset when an
Apple TV, Shield, game console, or PC changes between SDR, HDR10, HLG, and Dolby Vision. It does
not capture video, drive LEDs, or require HyperHDR.

> [!IMPORTANT]
> Version 0.1.0 targets rooted webOS 4.x and newer TVs, including the 2019 LG C9. The Luna payload
> handling is derived from the proven [`hyperion-webos`](https://github.com/webosbrew/hyperion-webos)
> subscriptions, but this independent bridge
> should be treated as pre-release software until it has been tested on physical C9 hardware.

## Install from Homebrew Channel

Open **Homebrew Channel → Settings → Add repository** and enter this exact URL:

```text
https://raw.githubusercontent.com/andrew-kennedy/lg-webos-picture-bridge/main/site/apps.json
```

Return to the app browser, install **LG Picture Bridge**, and launch it once. Homebrew Channel must
show **Root status: ok** because the monitor needs private Luna access and a startup hook.

The release workflow also deploys a browsable GitHub Pages site. The raw GitHub URL above is used
for Homebrew Channel so it remains independent of account-level Pages custom-domain redirects.

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

- the Home Assistant URL reachable from the TV, such as `http://10.0.0.5:8123`;
- the same random webhook ID;
- the LG webOS media-player entity.

The script uses `webostv.command` to launch the app with a `callback_url` parameter. The app stores
the configuration, starts its monitor, and sends a test event. Nothing needs to be typed with the TV
remote.

The app also accepts split launch parameters:

```json
{
  "home_assistant_url": "http://10.0.0.5:8123",
  "webhook_id": "a-long-random-value",
  "device_id": "living-room-c9",
  "device_name": "Living Room C9",
  "debounce_ms": 1200
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
  "bridge_version": "0.1.0"
}
```

A signal transition sends:

```json
{
  "event": "dynamic_range_changed",
  "dynamic_range": "dolby_vision",
  "previous_dynamic_range": "sdr",
  "source": "videooutput",
  "raw_value": "DolbyVision",
  "observed_at": "2026-08-01T15:30:00.000Z",
  "device_id": "living-room-c9",
  "device_name": "Living Room C9",
  "bridge_version": "0.1.0"
}
```

`dynamic_range` is one of `sdr`, `hdr10`, `hlg`, or `dolby_vision`. The raw LG value is retained for
diagnostics.

## How it works

```text
com.webos.service.videooutput/getStatus ─┐
                                        ├─> debounce + normalize ─> HA webhook
settingsservice picture subscription ───┘
```

The app provisions a persistent Node process through Homebrew Channel's elevated `exec` service.
[LG ships Node.js 0.12.2 on webOS TV 4.x](https://webostv.developer.lge.com/develop/guides/js-service-basics);
the monitor is deliberately written to that older
JavaScript runtime and uses the TV's `/usr/bin/node` executable directly.
It creates this startup hook:

```text
/var/lib/webosbrew/init.d/55-lg-picture-bridge
```

Configuration and logs are stored outside the application directory:

```text
/var/lib/io.github.andrewkennedy.lgpicturebridge/config.json
/var/lib/io.github.andrewkennedy.lgpicturebridge/bridge.log
```

The callback URL is stored with mode `0600` when supported. The app status screen always redacts the
webhook ID.

## Troubleshooting

- **Pairing fails immediately:** confirm Homebrew Channel reports `Root status: ok`.
- **Test event fails:** use a Home Assistant URL reachable directly from the TV. `homeassistant.local`
  may not resolve on older webOS versions; a reserved LAN IP is safer.
- **The monitor stops after a reboot:** launch Homebrew Channel once and verify its root startup hook
  is current. Then open LG Picture Bridge and select **Refresh status**.
- **No format changes arrive:** inspect `bridge.log` over SSH. The raw Luna service names and payloads
  can vary on unsupported firmware.
- **HTTPS fails on an older TV:** use an isolated local HTTP URL or a reverse proxy compatible with
  the TV's older TLS stack. Keep the webhook local-only.

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
- There is no generic command endpoint on the TV.
- Pairing payloads are validated before being written.
- The webhook sends observations only; it does not accept commands from Home Assistant.
- Home Assistant should keep the webhook local-only and use a unique, non-guessable ID.

## License

MIT
