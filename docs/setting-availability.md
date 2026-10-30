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

Precision Detail and Expression Enhancer cannot be declared supported from a saved value or their hidden factory baseline. An explicit model capability denial excludes Precision Detail for every preset; otherwise it requires a live applicability check in the exact target profile. Expression Enhancer and the port’s Prevent Input Delay control also require that live check. Unverified combinations remain excluded, with an explanation. This is a report of LG's control applicability, not a claim to have proven every physical image-processing effect.

## Selecting the right context

Factory metadata is resolved for the **target** bank, not whichever source is currently playing. Metadata for a current SDR movie must not enable HDR gamma, disable an inactive HDR brightness control, or offer movie-only choices in Game.

Live flags are used only when the input, preset/range, game genre and HDMI application match the requested bank and the bridge confirms a ready signal. Calibration and native brightness/color/clarity group locks also apply in that context. A context change during inspection aborts that inspection.

Unknown controller revisions remain read-only until their policies are reviewed. The firmware fingerprint is checked once per service lifetime; existing MQTT live controls retain their own native validation path.

## Editing and recovery

Both single-bank and combined edits validate applicability before committing standards. Combined edits validate the completed candidate and every target before the first persistent write. A failed later target cannot partially commit earlier edits. Shared brightness preferences validate their full affected set. Keeping temporary adjustments also checks applicability before promoting them.

The editor refreshes its capability cache on explicit refresh, profile revision, TV context/instance, or room-variant changes. Changes between inspection and saving are rechecked on the TV. Import/export and power-cycle recovery preserve the existing saved document; inapplicable historical values are not silently removed.

The factory files are streamed once on the first editor inspection and only reviewed HDMI metadata is retained in RAM. The model's Precision Detail capability is also read once on demand through Config Service; a missing or failed response is unknown, not a denial. The implementation adds no polling, persistent capability cache, diagnostics file or subscription. Editor inspections add bounded current-value reads to check native locks and scope. App-scoped motion values and their global calibration/group locks are read separately, as LG rejects a mixed app/global request. Ordinary TV startup and picture restoration do not need to load the editor metadata.

## Dolby Vision Precision Detail verification

The 2026-10-30 live audit on OLED77G6WUA firmware 43.21.69 checked every offered Dolby preset on HDMI 3 with a stable 3840×2160/24 Hz `DolbyLL` signal. This is the TV's full offered preset inventory, including modes outside the editor's curated collection. The model configuration explicitly reports `tv.model.dolbyVisionPrecisionDetail: false`; Settings Service's environment reports `boardTypeStr: "_O26_"`, `toolType: "G6"` and initial platform version 11.

| G6 Dolby Vision preset | Native value | Precision Detail live result |
| --- | --- | --- |
| Filmmaker | `dolbyHdrCinema` | Hidden and inactive |
| Cinema Home | `dolbyHdrCinemaBright` | Hidden and inactive |
| Standard | `dolbyHdrStandard` | Hidden and inactive |
| Vivid | `dolbyHdrVivid` | Hidden and inactive |
| Game Optimizer | `dolbyHdrGame` | Hidden and inactive |
| Personalized Picture | `dolbyHdrPersonalized` | Hidden and inactive |

`dolbyHdrCreator` was hidden in the native preset list and was not forced on. Every tested preset had an enabled Clarity group and no calibration lock, so those locks do not explain the missing control. The runtime measurements cover the recorded DolbyLL signal; the model-wide editor exclusion uses the explicit capability flag. This does not mean Dolby Vision or Dolby Vision IQ processing is disabled. [LG's guide](https://kr.eguide.lgappstv.com/manual/w23_mr2/global/Contents/settings/picture/clarity_k_u_b_e_c_a_t_j/enga/w23__settings__picture__clarity_k_u_b_e_c_a_t_j__enga.html) also notes that controls vary by model, signal and picture mode; that generic guide supplies no G6-specific preset matrix.

Further inspection of the captured 43.21.69 binaries found no exact `dolbyPrecisionDetail` key in either `pqcontroller` or `libpqc-ux-plugin.so.1.0.0`. `pqcontroller` does export `pq_nyxWrapper_getDolbyPdCtrl` and `pq_nyxWrapper_setDolbyPdCtrl`; these delegate to NYX interface slots `0xdc` and `0xe0`. No direct call to those wrappers appears in the captured controller disassembly. This is insufficient to claim that processing is absent: external libraries, indirect calls or other services have not been ruled out. `precisionHdrMasterPro` is a distinct setting and must not be mistaken for Dolby Precision Detail.

The audit paused profile tracking, selected each native offered Dolby preset, waited for two consistent availability samples, and restored Cinema Home and automatic management. Saved standards and temporary adjustments matched their pre-audit values. Precision Detail itself was never changed. The concise results are recorded in [g6-precision-detail-audit.json](g6-precision-detail-audit.json). Non-persistent preset commands did not advance the Settings Service context, so the completed audit used ordinary stored preset selection and restored the original mapping afterward.
