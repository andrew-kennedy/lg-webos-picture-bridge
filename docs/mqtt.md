# MQTT discovery, HDMI signal sensors and picture commands

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
    "tls": false,
    "commands_enabled": true,
    "cec_commands_enabled": false
  }
}
```

The [Configure LG Picture Bridge MQTT script](../home-assistant/lg_picture_bridge_mqtt_pairing_script.example.yaml) avoids TV
keyboard entry. Keep its secrets outside source control. HA action traces may include resolved
launch parameters; for environments where that is unacceptable, transfer configuration over SSH
and pipe it into `bridge/configure.js pair-stdin`, then restart the bridge. That command reads JSON
from stdin and prints only paired/transport status. Never print the full existing config because it
contains broker credentials and any webhook/HTTP command credentials.

Configuration persists across updates, so do not run setup again just to upgrade. Launch setup
replaces the saved configuration rather than merging it. Use the MQTT script, not the legacy
webhook-only script, for an MQTT installation. The filename retains `pairing` for existing links;
the TV UI calls this configuration, not pairing or an HA authentication handshake.

In 0.5.1+, **Republish discovery** reports only submission, never confirmed HA receipt. It errors
if the MQTT publisher is disconnected/stopped or cannot submit the discovery/state/availability
batch. The new app-only Luna method is `refreshReporting`; `testWebhook` remains as a compatibility
alias with the same behavior. Neither method applies picture settings. See the
[TV status screen guide](../README.md#tv-status-screen-051) for all controls.

Use `transport: both` and supply your existing `callback_url` to retain webhook observations during
migration. With `transport: mqtt`, callback_url is optional and no webhook is sent. With no MQTT
settings, old configurations default to `webhook`. Always preserve the existing `device_id` and
`command_token` when keeping HTTP rollback, so entity identities and HTTP authorization stay stable.
The token is optional for MQTT-only installations and is never sent in MQTT commands.
Commands remain disabled unless `mqtt.commands_enabled` is explicitly `true`.
CEC policy commands are a separate opt-in, `mqtt.cec_commands_enabled`, introduced
in 0.7. They use `/cec/command` and `/cec/state` and do not require a current HDMI
picture. See [generic CEC filtering](cec-filter.md) for capabilities, HA scripts,
discovery entities, migration from 0.6, and safety limits. Extend broker ACLs for
those two topics only when enabling that feature.

TLS is supported with `tls: true` (default port 8883), certificate verification enabled, and an
optional PEM `ca` string. The C9's old Node/OpenSSL runtime may not negotiate a modern broker's TLS
policy. Do not disable certificate verification to compensate. Plain MQTT credentials are visible
on the network; use it only on an appropriately isolated trusted LAN.

## Discovery and state

The TV publishes six observation discovery messages, plus a seventh command-status sensor when
commands are enabled, under `homeassistant`, grouped into one
device with stable IDs derived from `device_id`. Default entity names are listed in the README;
Home Assistant may add a suffix on collision, and user-renamed entity IDs are preserved. Nothing
requires `c9` in an entity ID. Changing `device_id` creates a new MQTT device; remove old discovery
topics deliberately if replacing an identity.

Discovery messages and online/offline availability are retained. **State messages are not retained.**
The bridge republishes discovery, its latest state and availability on broker connection and on
`homeassistant/status = online`, and refreshes state every 30 seconds. Sensors expire after 90
seconds without a fresh publish. Abrupt disconnection uses a retained offline Last Will; orderly
shutdown sends offline explicitly. HA restarts must not replay an old no-signal reading as a new
event. MQTT 3.1.1 QoS 0 snapshots are used; the regular refresh repairs dropped
updates. A small bounded client uses only Node built-ins to support webOS 4's Node 0.12.2.

The state object includes physical `input`, `picture_input_dimension` (e.g. `hdmi1_pc`),
`signal_present` (true/false/null), `signal_state`, `screensaver_type`, `dynamic_range`,
`picture_mode`, `device_id`, `observed_at`, and `bridge_version`. Input/signal/range are unknown
outside a recognized active HDMI pipeline. The picture preset remains known on no signal if its
input matches; range becomes unknown because stored picture settings can retain the previous HDR
bank while no video is arriving. A failed picture subscription clears that picture data.

Use broker ACLs allowing the device to publish only its discovery topics and
its state/availability/command-status topics, and to subscribe to `homeassistant/status` plus its
own `lg_picture_bridge/lgpb_<device-hash>/command` topic when commands are enabled. Authorize HA to
publish that command topic and consume the device's state/discovery. Other broker clients must not
be allowed to impersonate either endpoint. MQTT permissions replace the HTTP bearer token for this
path. Anyone able to publish authorized commands can change picture settings; keep the broker private.

## Picture-policy commands

Install [the MQTT request/reply script](../home-assistant/lg_picture_bridge_mqtt_command.example.yaml)
as `script.lg_tv_mqtt_picture_policy`. It defaults to `sensor.lg_tv_picture_command`; pass
`command_entity` if you renamed that discovered entity. The script serializes requests, publishes
with `retain: false`, and waits for a matching result from the same connection session. It checks
cached sensor attributes, so an immediate reply cannot race a publish-then-subscribe wait.

```yaml
action: script.lg_tv_mqtt_picture_policy
data:
  policy:
    input: hdmi3
    scope: active
    dry_run: true
    modes: {sdr: expert1, hdr: hdrCinema, dolbyHdr: dolbyHdrCinema}
    presets:
      expert1: {settings: {backlight: 80}}
      hdrCinema: {settings: {backlight: 100}}
      dolbyHdrCinema: {settings: {backlight: 100}}
```

The script returns `{ok: true, request_id, state: completed, dry_run, input, scope,
operation_count, completed_at}` only after the bridge finishes (or validates the dry run).
It aborts its sequence with `stop`/`error: true` for an explicit rejection or timeout, with no
automatic HTTP/alert fallback. HA may return a null service response for an aborted script, so
callers must require a mapping with `ok: true` before continuing (see the README facade example).
The REST service-call API can also expose this as an empty response object, not an HTTP error.
**Timeout means unconfirmed, not necessarily unapplied.** `ok` means the firmware accepted each
write, not that every setting is meaningful on every model. Existing recipes remain firmware-specific.

Protocol, under `lg_picture_bridge/lgpb_<device-hash>`:

| Topic | Direction | Payload |
| --- | --- | --- |
| `/command` | HA → TV | JSON envelope below; never retain |
| `/command_status` | TV → HA | Non-retained readiness, session ID and last 16 terminal results |

```json
{
  "protocol": 1,
  "request_id": "ha-unique-request-id",
  "session_id": "COPY_FROM_CURRENT_COMMAND_SENSOR",
  "expires_at": 1789800030,
  "policy": {"input": "hdmi3", "scope": "active", "modes": {"sdr": "expert1"},
             "presets": {"expert1": {"settings": {"backlight": 80}}}}
}
```

`expires_at` is Unix seconds, greater than the TV's current time and at most 60 seconds ahead (keep
HA/TV clocks synchronized; the example timestamp is illustrative). The wrapper chooses 30 seconds,
retries the identical envelope up to three times, and waits at most 30 seconds after readiness.
The request ID is 1–96 ASCII letters/digits/underscores/hyphens, starting with a letter/digit.
The policy's request ID is replaced with the envelope's. Maximum envelope size is 48 KiB.

- A new unpredictable session ID is issued on each broker connection; readiness waits for SUBACK.
- Clean MQTT sessions, no offline command buffer, ignored retained deliveries and short expiries
  prevent reconnect replay. MQTT 3.1.1 strips RETAIN for live subscribers, so publishers **must not
  retain**; the session/expiry checks also guard future retained replays.
- Up to 64 recent accepted requests are deduplicated for at least two minutes within a session.
  Identical retries return the original result without rewriting. Reusing an ID for different bytes
  returns `request_id_conflict`. The result sensor keeps the last 16 results and refreshes every 30s.
- HTTP and MQTT share the existing bounded execution queue. Session, expiry and input/range/signal
  guards run at queue entry and before every Luna write. `active` requires a confirmed HDMI picture.
  Mode changes caused by the writer itself do not invalidate the request.
- A changed context, failed write or timeout can leave earlier operations applied. They are not
  rolled back. Error replies include `error`, `message`, and where applicable `operation_index`.
- No command publishes power, IR, input selection, arbitrary Luna URI or shell requests.

After migrating the HA facade, the dedicated `lg_rooted_bridge.yaml` REST package is unnecessary.
Back it up outside the packages include directory, remove only that dedicated package, reload REST
commands and run a HA configuration check. Do not remove the backend-selection helper or recipes.
Leaving `command_token` on the TV keeps optional HTTP rollback available; clearing it disables HTTP.

## Migrating existing automations

1. Pair in `both` mode first and confirm the new entities and their actual entity IDs.
2. Confirm signal loss/recovery on the actual device/switch chain, and broker/TV reconnection.
3. Prefer triggering your picture dispatcher directly on input/range/signal sensors, with a settling
   delay and readiness checks. Do not trigger it on picture-mode writes or command-result updates.
   For installations that still require the old custom event, the optional
   [MQTT compatibility event adapter](../home-assistant/lg_picture_bridge_mqtt_events.example.yaml).
   It feeds the existing `lg_picture_bridge_dynamic_range_changed` consumer without changing power
   or input routing. It responds to signal recovery, input, and range changes, **not picture-mode
   writes**, avoiding a write/report/write feedback loop. Each context-state change restarts a
   one-second settling delay before the combined state is checked, coalescing simultaneous signal
   and range changes. Consumers should remain idempotent if events repeat.
4. Switch to `transport: mqtt` once verified. Migrate commands using the script above, then remove
   the HA REST entry/package after successful verification. Direct-sensor dispatchers need neither
   the old webhook receiver nor the compatibility adapter.

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

## Live validation

The 0.5 MQTT command implementation passes the automated suite, parses/runs its command smoke
test under Node 0.12.2, and has been exercised against Home Assistant 2026.9.3 and a real Mosquitto
broker with a **simulated, dry-run-only picture writer**. Those HA tests confirmed immediate replies,
a 12-second delayed reply with a deduplicated retry, and rejection reported as an aborted script
without an `ok` response. The temporary test discovery entity was removed afterward.

Version 0.5.0 was subsequently installed and verified on the actual rooted C9:

- Existing pairing/device identity and credentials were preserved; only MQTT commands were enabled.
- The seventh discovery entity, `sensor.lg_tv_picture_command`, reported ready with a new session.
- A policy dry run completed through the real HA script and TV bridge with three planned operations.
- During a Dolby Vision signal on HDMI 3, MQTT changed the current Cinema preset's OLED light from
  100 to 99. A direct TV settings read confirmed 99. MQTT restored 100 and TV readback confirmed it.
  The picture mode and physical input were unchanged.
- The existing dispatcher → movie recipe → facade → MQTT script path completed four Luna writes
  with a correlated success response. This was repeated after removing and reloading the dedicated
  HA REST package; the old REST action was confirmed absent and the HA configuration check passed.
- The five device-sync automations, picture-dispatcher definition and game/movie recipes were
  preserved unchanged. Only the picture facade's transport action and success check were migrated.
- A bridge-service-only restart created a new MQTT command session. Sensors recovered and the
  unchanged picture dispatcher automatically completed another four-write movie policy through
  MQTT, with the REST action still absent. The TV itself was not rebooted or power-cycled.

This confirms real firmware writes/readback on the tested Dolby Vision context, not a new visual
calibration or a fresh validation of every SDR/HDR setting on every model. The optional TV HTTP
endpoint remains available for deliberate rollback, but HA no longer calls it.

Version 0.4.0 was tested on a rooted C9 with Node 0.12.2 and Home Assistant MQTT discovery:

- All six entities were discovered and resumed reporting after TV standby/wake.
- A controlled external-switch change produced signal `on -> off -> on` without changing the TV's
  HDMI input or restarting the bridge. Range became unknown during signal loss and returned to
  Dolby Vision when video recovered.
- The authenticated picture-policy API accepted a dry-run request without writing settings.
- MQTT sensor changes drove the existing picture-policy event consumer after webhook migration.
- The stdin pairing helper was exercised on the TV using an isolated temporary configuration.

These checks do not yet validate Nintendo Switch sleep inference, cold-boot behavior, broker-outage
recovery, or compatibility with other firmware versions.
