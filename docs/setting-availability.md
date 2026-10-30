# Applicability in the picture standards editor

The editor distinguishes a stored value from a control LG enables for its target input and preset. Inapplicable and unverified values are excluded from editable rows and combined edits. A collapsed explanation lists them. Existing standards and backups retain those values; opening the editor never migrates, deletes or applies them.

## Sources of evidence

The implementation combines read-only inspection of the G6's files with its current native descriptions:

- `/etc/palm/description.json` supplies base types, ranges, choices and hardware conditions.
- `/etc/palm/override.json` supplies the input/preset/range overrides, including individual choices that should be hidden or disabled.
- `/var/luna/preferences/environmentCondition` identifies the hardware conditions used by Settings Service.
- `/usr/palm/applications/com.palm.app.settings/main.js` adds dependencies such as adjustable 2.2 gamma, TruMotion User Selection, calibration locks and picture-group locks.
- `/usr/lib/libpqc-ux-plugin.so.1.0.0` adds runtime picture-controller policy. Its reviewed SHA-256 is `21f216519afd0db4dc7a57e0a086217634835afc3a74e094a4cc392a07709589`.

LG's [published Settings Service source](https://github.com/webosose/settingsservice) explains the layered declarations and why `getSystemSettingDesc` uses current dimensions. The public source is older than the installed TV software; it is supporting context, not an assumption that every implementation detail is unchanged.

The native controller's `pq_ux_setBasicPictureMenuInfoToDB` explicitly disables `brightness`, `contrast`, `sharpness` and `color` while Game Optimizer is active. The editor therefore offers the corresponding Game Optimizer controls for Game presets. Other reviewed restrictions include SDR-only gamma, SDR Game Peak Brightness, Game Real Cinema, Filmmaker Ambient Light Compensation and HGiG choices in Game presets.

Precision Detail and Expression Enhancer cannot be declared supported from a saved value or their hidden factory baseline. They require a live applicability check in the exact target profile. Unverified combinations remain excluded, with an explanation. This is a report of LG's control applicability, not a claim to have proven every physical image-processing effect.

## Selecting the right context

Factory metadata is resolved for the **target** bank, not whichever source is currently playing. Metadata for a current SDR movie must not enable HDR gamma, disable an inactive HDR brightness control, or offer movie-only choices in Game.

Live flags are used only when the input, preset/range, game genre and HDMI application match the requested bank and the bridge confirms a ready signal. Calibration and native brightness/color/clarity group locks also apply in that context. A context change during inspection aborts that inspection.

Unknown controller revisions remain read-only until their policies are reviewed. The firmware fingerprint is checked once per service lifetime; existing MQTT live controls retain their own native validation path.

## Editing and recovery

Both single-bank and combined edits validate applicability before committing standards. Combined edits validate the completed candidate and every target before the first persistent write. A failed later target cannot partially commit earlier edits. Shared brightness preferences validate their full affected set. Keeping temporary adjustments also checks applicability before promoting them.

The editor refreshes its capability cache on explicit refresh, profile revision, TV context/instance, or room-variant changes. Changes between inspection and saving are rechecked on the TV. Import/export and power-cycle recovery preserve the existing saved document; inapplicable historical values are not silently removed.

The factory files are streamed once on the first editor inspection and only reviewed HDMI metadata is retained in RAM. The implementation adds no polling, persistent capability cache, diagnostics file or subscription. Editor inspections add a bounded current-value read to check native locks and scope. Ordinary TV startup and picture restoration do not need to load the editor metadata.

## Dolby Vision Precision Detail verification

The 2026-10-27 native `pictureMode` description on HDMI 3 reported all six presets below as visible and active. This is the TV's preset inventory, not the editor's smaller curated collection. The same capture checked Precision Detail only in Filmmaker, with a 3840×2160/24 Hz `DolbyLL` signal. An offered preset does not imply that Precision Detail works in it.

| G6 Dolby Vision preset | Native value | Precision Detail live result |
| --- | --- | --- |
| Filmmaker | `dolbyHdrCinema` | Hidden and inactive in the captured HDMI 3 DolbyLL context |
| Cinema Home | `dolbyHdrCinemaBright` | Pending |
| Standard | `dolbyHdrStandard` | Pending |
| Vivid | `dolbyHdrVivid` | Pending |
| Game Optimizer | `dolbyHdrGame` | Pending |
| Personalized Picture | `dolbyHdrPersonalized` | Pending |

`dolbyHdrCreator` was hidden in that preset list. A fresh audit must enumerate the current native choices rather than assume that a list of five modes is complete. Availability in standard Dolby Vision, DolbyLL, different timings, or another input must not be inferred from a single tested signal. [LG's guide](https://kr.eguide.lgappstv.com/manual/w23_mr2/global/Contents/settings/picture/clarity_k_u_b_e_c_a_t_j/enga/w23__settings__picture__clarity_k_u_b_e_c_a_t_j__enga.html) also notes that controls vary by model, signal and picture mode; that generic guide supplies no G6-specific preset matrix.

Further inspection of the captured 43.21.69 binaries found no exact `dolbyPrecisionDetail` key in either `pqcontroller` or `libpqc-ux-plugin.so.1.0.0`. `pqcontroller` does export `pq_nyxWrapper_getDolbyPdCtrl` and `pq_nyxWrapper_setDolbyPdCtrl`; these delegate to NYX interface slots `0xdc` and `0xe0`. No direct call to those wrappers appears in the captured controller disassembly. This is insufficient to claim that processing is absent: external libraries, indirect calls or other services have not been ruled out. `precisionHdrMasterPro` is a distinct setting and must not be mistaken for Dolby Precision Detail.

The pending live audit should pause profile tracking, select only native offered Dolby presets temporarily, allow the descriptions to settle, and record visibility, activity, calibration/group locks and the actual signal for each preset. It must restore the starting preset and management state and compare standards and temporary adjustments afterward. It does not need to toggle Precision Detail itself. No all-preset live audit has been completed while the TV is unreachable.
