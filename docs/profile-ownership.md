# TV-owned picture profiles (0.13)

The TV stores and restores standards. Home Assistant 0.3 supplies day/night context, provides the same editor, and stores complete backups. Existing native input, range and ALLM mappings select presets. HDMI source routing, CEC filtering and Nintendo no-signal shutdown are independent and unchanged.

## Daily operation

Open **Picture profiles** in the TV app or the HA sidebar. Select a device, its native profile, and Base/Bright/Dark. Selecting a profile in the editor does not select that HDMI input. Values are drafts until **Save standard**. TV descriptions supply supported options and numeric bounds. **Restore this profile** restores its saved values; **Keep current adjustments** explicitly promotes its tracked changes. Shared native banks have one shared standard, clearly labeled in the editor.

Movie SDR brightness has separate bright/dark values; choose that room variant to edit it. SDR game brightness is shared across its assigned game banks. The companion exposes three number entities, and existing optional input_number helpers remain synchronized controllers. Native MQTT setting sliders are temporary controls, distinct from these standard-brightness controls.

Only keys defined in the collection are managed. Remote changes never automatically teach a new standard. Changing a managed mode mapping to a preset outside the curated collection is still a temporary deviation, but cannot be promoted as a supported standard. Panel-specific white balance/CMS calibration is not imported.

## Storage and recovery

`/var/lib/io.github.andrewkennedy.lgpicturebridge/profiles.json` contains schema 1 standards, owner ID, revision, enabled state and brightness preferences. Explicit edits use atomic replacement with fsync. A separate small `profile-session.json` records dirty bank/key membership, pending restores, boot ID, power and the last applied room environment. Repeated values for an already dirty slider do not rewrite that journal. These are ordinary app files, never system partitions.

Values stay in RAM and are also backed up through MQTT. On a same-boot service restart, only dirty banks are read to reconstruct temporary values from LG's saved settings. Confirmed native standby or a changed kernel boot ID schedules restoration of dirty scopes. Unknown/disconnected states, format changes, Screen Off and Screen Saver do not end a viewing session. Native power states follow the [lgtv2 power-state documentation](https://github.com/hobbyquaker/lgtv2/blob/master/README.md); model-specific behavior should be verified during installation.

Restores persist intent before writing, use compare-and-set reads and exact native scope/readback checks, and write differences only. Interrupted work remains queued. Retries back off from 5 seconds to 5 minutes only while recovery has failed and the TV is on; there is no additional healthy-state polling. A newer manual change cancels an older pending restore for that key and becomes a temporary adjustment for the current session.

Native preset transitions do not reapply profiles. Day/night context is supplied retained by HA on `<base>/profiles/environment` (`{"protocol":1,"room":"dark"}`). While HA is unavailable the TV keeps the last known room context. On reconnect it receives the current sun state. Existing temporary adjustments survive room transitions.

## Complete backup envelope

`<base>/profiles/backup` is retained and contains:

```json
{"protocol":1,"format":"lg-picture-bridge-backup","state_json":"<complete JSON state>","sha256":"<SHA-256 of the exact UTF-8 state_json bytes>"}
```

The decoded state contains `schema`, `owner_id`, `instance_id`, `sequence`, `revision`, `document`, `preferences`, `enabled`, `room`, `environment`, `overrides`, `recovery`, `migration_id`, `context` and `created_at`. `document` includes all saved native banks, per-room variants and device bindings. `recovery` includes dirty keys, pending restore scopes, boot ID and power. `reconstructing` explicitly marks a startup snapshot whose temporary values have not yet been read back. No account secrets, broker passwords, firmware or unrelated system configuration are included.

Backups are emitted after changes (at most twice per second during adjustment bursts), at power transitions, on broker reconnect and HA discovery refresh. Full snapshots are not embedded in entity attributes or sent with the bridge heartbeat. A SHA over the exact JSON text avoids cross-language float/canonicalization differences. It detects corruption; it is not an authentication signature. Broker access control protects this local protocol.

HA commits the envelope using its native atomic Store, then publishes a non-retained acknowledgement on `<base>/profiles/backup/ack` with `owner_id`, `instance_id`, `sequence`, and `sha256`. Only the current snapshot's matching acknowledgement marks it backed up. Duplicate snapshots are acknowledged without rewriting HA storage. Old sequences and snapshots from a different non-live process cannot replace the saved copy. HA also keeps the last five standard revisions, plus the complete legacy HA-owned document during migration.

**Download backup** exports the complete envelope. Importing a backup deliberately restores its standards and preferences and queues verified native restoration; historical temporary deviations are not replayed into a new viewing session. They remain available in the backup for inspection. Download/upload and the HA `export_profiles`/`import_profiles` actions also support the schema 1 standard document; the HA actions additionally accept/export YAML.

## Migration

Upgrade both components. The HA companion preserves its entire previous Store as `legacy`, stops HA-side policy execution, and waits for API version 2. If the TV has no collection, HA imports the existing standard document unchanged, the three current helper values, temporary adjustments, and pending restore scopes. The migration ID makes an identical retry harmless. Migration completes only after HA has saved a matching TV backup. A pre-existing TV collection is never silently replaced by HA's old copy.

Before the updated TV is reachable, the HA integration reports `awaiting_tv_migration`. Existing native settings remain on LG's saved banks; temporary restoration/day-night management resumes after migration. Downloadable backups remain available while the TV is offline, but edits require the TV because it is the sole authority. Do not edit live HA `.storage` manually.

## API

`/profiles/status` advertises `api_version:2` and a compact `manager` status. Commands on `/profiles/command` use protocol 1, current `session_id`, a unique `request_id`, and an expiry within 60 seconds, never retained. Supported actions: `get`, `inspect`, `initialize`, `import`, `edit`, `set_enabled`, `set_brightness`, `set_environment`, `restore`, `save`, `reconcile`, `backup`, `restore_backup`. Document changes carry the expected `revision`; a stale editor must refresh. Scope is `active`, `all`, or a bank ID.

The TV app uses its permission-scoped Luna `profiles` method. The HA editor uses an authenticated admin WebSocket command. No new HTTP server, credential prompt, cloud dependency or background UI polling is needed. The shared editor source is `app/profile-editor.js`; the HA repository vendors it with a checked SHA via `scripts/sync-editor.py`.
