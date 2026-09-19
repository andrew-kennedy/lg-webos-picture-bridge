# MQTT discovery and HDMI signal sensors

## Setup

Use an existing private MQTT broker connected to Home Assistant. Upgrade the bridge package before
pairing; new Luna permissions must be installed and the service restarted. Do not replace only the
JavaScript files on an already-running service.

Launch parameters can contain this `setup` object:

```json
{
  "transport": "mqtt",
  "device_id": "living-room-lg-c9",
  "device_name": "Living Room LG TV",
  "command_token": "REUSE_YOUR_EXISTING_RAW_COMMAND_TOKEN",
  "debounce_ms": 500,
  "mqtt": {
    "host": "10.0.0.4",
    "port": 1883,
    "username": "YOUR_MQTT_USER",
    "password": "YOUR_MQTT_PASSWORD",
    "topic_prefix": "lg_picture_bridge",
    "discovery_prefix": "homeassistant",
    "tls": false
  }
}
```

The [pairing script](../home-assistant/lg_picture_bridge_mqtt_pairing_script.example.yaml) avoids TV
keyboard entry. Keep its secrets outside source control. HA action traces may include resolved
launch parameters; for environments where that is unacceptable, transfer configuration over SSH
and pipe it into `bridge/configure.js pair-stdin`, then restart the bridge. That command reads JSON
from stdin and prints only paired/transport status. Never print the full existing config because it
contains the webhook and HTTP command credentials.

Use `transport: both` and supply your existing `callback_url` to retain webhook observations during
migration. With `transport: mqtt`, callback_url is optional and no webhook is sent. With no MQTT
settings, old configurations default to `webhook`. Always preserve the existing `device_id` and
`command_token` when migrating, so entity identities and picture-writing authorization stay stable.

TLS is supported with `tls: true` (default port 8883), certificate verification enabled, and an
optional PEM `ca` string. The C9's old Node/OpenSSL runtime may not negotiate a modern broker's TLS
policy. Do not disable certificate verification to compensate. Plain MQTT credentials are visible
on the network; use it only on an appropriately isolated trusted LAN.

## Discovery and state

The TV publishes six single-component discovery messages under `homeassistant`, grouped into one
device with stable IDs derived from `device_id`. Default entity names are listed in the README;
Home Assistant may add a suffix on collision, and user-renamed entity IDs are preserved. Nothing
requires `c9` in an entity ID. Changing `device_id` creates a new MQTT device; remove old discovery
topics deliberately if replacing an identity.

Discovery messages and online/offline availability are retained. **State messages are not retained.**
The bridge republishes discovery, its latest state and availability on broker connection and on
`homeassistant/status = online`, and refreshes state every 30 seconds. Sensors expire after 90
seconds without a fresh publish. Abrupt disconnection uses a retained offline Last Will; orderly
shutdown sends offline explicitly. HA restarts must not replay an old no-signal reading as a new
event. MQTT 3.1.1 QoS 0 snapshots, not a command queue, are used; the regular refresh repairs dropped
updates. A small bounded client uses only Node built-ins to support webOS 4's Node 0.12.2.

The state object includes physical `input`, `picture_input_dimension` (e.g. `hdmi1_pc`),
`signal_present` (true/false/null), `signal_state`, `screensaver_type`, `dynamic_range`,
`picture_mode`, `device_id`, `observed_at`, and `bridge_version`. Input/signal/range are unknown
outside a recognized active HDMI pipeline. The picture preset remains known on no signal if its
input matches; range becomes unknown because stored picture settings can retain the previous HDR
bank while no video is arriving. A failed picture subscription clears that picture data.

Use broker ACLs allowing the device to publish only its discovery topics and
`lg_picture_bridge/lgpb_<device-hash>/#`, and to subscribe to `homeassistant/status`.
The bridge does not subscribe to command topics; continue using the authenticated HTTP policy API.

## Migrating existing automations

1. Pair in `both` mode first and confirm the new entities and their actual entity IDs.
2. Confirm signal loss/recovery on the actual device/switch chain, and broker/TV reconnection.
3. Disable the old webhook receiver, then enable the
   [MQTT compatibility event adapter](../home-assistant/lg_picture_bridge_mqtt_events.example.yaml).
   It feeds the existing `lg_picture_bridge_dynamic_range_changed` consumer without changing power
   or input routing. It responds to signal recovery, input, and range changes, **not picture-mode
   writes**, avoiding a write/report/write feedback loop. The one-second stable-state trigger
   normally coalesces context changes. Consumers should remain idempotent if events repeat.
4. Switch to `transport: mqtt` once verified. Keep the HTTP `rest_command` and token unchanged.

Alternatively, new automations can trigger directly on these sensor states. For a Switch shutdown
inference, require a previously observed valid signal in the same Switch session, the TV still on
HDMI 3, other source devices inactive, and sustained signal absence (for example 20 seconds, to be
tuned after testing). `unknown`/`unavailable` must never be treated as `off`. The generic signal
sensor cannot identify which device the external HDMI switch has selected, and a format change or
cable fault can also interrupt video. No automatic TV shutdown automation is installed by this app.

## C9 signal source

Read-only live testing on a rooted C9 verified `good -> bad/NO_SIGNAL -> good` while the TV stayed
on HDMI 3 and only the external switch was changed. HDMI 5V stayed true during no signal.

- `com.webos.service.acb/getForegroundAppInfo` supplies the active HDMI application's pipeline ID.
- `com.webos.service.tv.externaldevice/input/getSignalState` subscribes using that ID as
  `externalInputId`, reporting `signalState.videoSignalState` and `screensaverType`.

Pipeline IDs are dynamic. The monitor cancels old subscriptions on session changes, ignores late
callbacks from old sessions, and retries failed subscriptions. It does not open/switch pipelines,
take screenshots, change power, or infer signal from a stale picture-mode setting.

These are firmware-specific APIs. MQTT standardizes the HA interface, not TV capabilities; this
implementation still requires rooted/private Luna access. A future unrooted-TV reader can reuse
the discovery model if it can obtain equivalent data by another supported mechanism.
