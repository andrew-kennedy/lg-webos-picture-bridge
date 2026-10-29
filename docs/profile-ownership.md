# TV-owned picture profiles (0.13)

The TV stores and restores standards. Home Assistant 0.3 supplies day/night context, provides the same editor, and stores complete backups. Existing native input, range and ALLM mappings select presets. HDMI source routing, CEC filtering and Nintendo no-signal shutdown are independent and unchanged.

## Daily operation

Open **Picture profiles** in the TV app or the HA sidebar. Select any combination of ports, formats and preset families. **More factors** offers exact presets, ALLM, configured game genres and Base/Bright/Dark room variants. These filters select existing managed settings; they do not change the TV input, create new native banks or apply anything.

Choose a settings category:

| Category | What it contains |
| --- | --- |
| **Picture** | Color, sharpness, contrast, black level and other picture controls. Equivalent Game Optimizer controls join the same row. |
| **Motion** | Real Cinema, TruMotion and other configured motion controls. Real Cinema remains stored in LG's ordinary picture bank. |
| **Gaming** | Distinct Game Optimizer controls, such as stabilizers, fine tune dark areas and the port's genre selector. |
| **HDMI connection** | Port-wide options such as ALLM, VRR, QFT and refresh-rate boost. All connected devices and formats share them. |
| **Preset selection** | Which picture preset LG selects for each input and signal range, including ALLM and dormant mappings. |

**Show separate controls by** splits the selected settings by port, format, preset family, exact preset, genre or ALLM. Removing a split combines controls. Equal values display normally; unequal values show **Mixed** until you explicitly choose a common value. Splits only follow factors relevant to the setting: QFT remains port-wide, and Real Cinema remains per input/preset. The stored-value details show exact native targets. Apple TV and Shield share movie banks; Switch uses game banks on the same port. A broad edit changes the listed existing values once; it does not create an inheritance rule for future banks.

Values remain drafts across filter, category and room changes. **Review changes** lists only the changed fields, their before/after values and their original targets, including drafts outside the current selection. **Save standards** validates the entire batch, checks its revision and commits one standard revision. Native writes run through the existing verified recovery journal; a saved batch can have pending TV application if a native write fails. Uncommitted drafts survive failures. An editor conflict requires another explicit review against the latest standards.

**Restore selected** and **Keep adjustments** also require a preview. They act on the selected setting keys, not whole LG banks: restoring Motion can restore Real Cinema without touching Contrast in the same bank. Keep promotes only tracked temporary values and verifies they have not changed since review. A room change invalidates an open restore/keep preview. These actions use the current room, shown in the preview; the room variant selector controls which standards you edit.

TV descriptions supply supported options and numeric limits. A combined control uses their intersection and waits for all required metadata. Metadata is read on demand and cached while browsing; **Refresh** explicitly rereads it. There is no background editor polling. **Last TV read** is a snapshot from the native target, even if its input is inactive; it is not a power indicator. Tracked deviations show **Temporary**, and offline views use the saved backup.

Movie SDR brightness has shared bright/dark preferences; choose that room variant to edit it. SDR game brightness is shared across all assigned game banks. These controls always preview their full affected set, even outside the selected ports. The companion's three standard-brightness numbers edit the same preferences. Ordinary MQTT setting sliders remain temporary controls.

LG stores ordinary picture values, including Real Cinema and TruMotion de-judder/de-blur, by input and picture preset. Only `truMotionMode` also uses the matching `com.webos.app.hdmiN` app scope. Game Optimizer values use physical input, signal-format/ALLM and game genre. The editor groups these for presentation while preserving their true storage identities. Refresh-rate boost uses the TV's reported panel rate (165 Hz on the verified G6), without changing the internal key or entity ID.

Only keys defined in the collection are managed. Remote changes never teach a new standard automatically. Changing a managed mapping to an unconfigured preset is tracked as temporary but cannot be promoted as a supported standard. Panel-specific white balance/CMS calibration is not imported.

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

In the Home Assistant panel, **Download backup** exports the complete envelope. The TV app omits file import/download controls because its browser file handling is unsupported; automatic MQTT backups continue independently. Importing a backup deliberately restores its standards and preferences and queues verified native restoration; historical temporary deviations are not replayed into a new viewing session. They remain available in the backup for inspection. Download/upload and the HA `export_profiles`/`import_profiles` actions also support the schema 1 standard document; the HA actions additionally accept/export YAML.

## Migration

For an older HA-owned collection, first use companion 0.3.2 with bridge 0.13.2 or newer. That companion preserves its entire previous Store as `legacy`, stops HA-side policy execution, and waits for API version 2. If the TV has no collection, HA imports the existing standard document unchanged, the three current helper values, temporary adjustments, and pending restore scopes. The migration ID makes an identical retry harmless. Migration completes only after HA has saved a matching TV backup. A pre-existing TV collection is never silently replaced by HA's old copy. Once the TV owns the collection and HA has its complete backup, upgrade the companion to 0.4 or newer. Its entry migration removes helper bindings while preserving standards and brightness preferences. Move external references to the built-in number entities before deleting old helpers.

Before the updated TV is reachable, the HA integration reports `awaiting_tv_migration`. Existing native settings remain on LG's saved banks; temporary restoration/day-night management resumes after migration. Downloadable backups remain available while the TV is offline, but edits require the TV because it is the sole authority. Do not edit live HA `.storage` manually.

## API

`/profiles/status` advertises transport `api_version:2` and a compact `manager` status. Manager `editor_api:3` enables the scope editor; older bridges remain read-only in the new editor. Commands use protocol 1, current `session_id`, a unique `request_id`, and an expiry within 60 seconds, never retained. Supported actions: `get`, `inspect`, `initialize`, `import`, `edit`, `edit_many`, `set_enabled`, `set_brightness`, `set_environment`, `restore`, `save`, `reconcile`, `backup`, `restore_backup`.

`edit_many` carries an expected `revision`, an `edits` array of `{bank_id, variant, settings}` patches and an optional shared `preferences` patch. Every target/value is validated before one atomic standards-file replacement. Duplicate targets, conflicting shared brightness values, stale revisions and power-session changes reject the batch without partial commitment. Unchanged standards cause no file write or revision. Native application remains sequential, compare-and-set, verified and journaled; it is not a hardware transaction.

Editor `restore` and `save` commands carry `selection: {bank_id: [key, ...]}`, `revision` and the reviewed `room`. `save` also carries `expected: {bank_id: {key: temporaryValue}}`. This freezes the selected keys and rejects adjustments or room context that changed after review. Legacy callers can still use `scope: active | all | bank_id`.

The TV app uses its permission-scoped Luna `profiles` method. The HA editor uses an authenticated admin WebSocket command. No new HTTP server, credential prompt, cloud dependency or background UI polling is needed. The shared sources are `app/profile-editor.js` and the pure presentation model `app/profile-view.js`; the HA repository vendors both with checked SHAs via `scripts/sync-editor.py`.
