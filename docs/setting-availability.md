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

Gamma also requires a live check in the target SDR profile, including its dependent fine adjustment. The 2026-10-30 comparison found that inactive factory metadata offered `low`, `medium`, `high1`, and `high2`, while the live G6 offered only `high2` and `mediumHavingLevel`. The native `pq_ux_setGammaInfoToDB` controller updates its description at runtime. Keeping an existing adjustable-2.2 value does not validate the obsolete factory choices. HDR/Dolby Vision Gamma remains inapplicable, and existing saved Gamma standards are preserved.

HDMI Black Level also requires live verification for an inactive Dolby Vision profile. Both configured Dolby movie presets were locked live, although the inactive Cinema Home factory table offered an editable range. `pq_ux_setBlackLevelMenuInfoToDB` consults runtime HDR status, color system, input and sub-window state. The editor excludes that unverified inactive control without rewriting its stored value. Active profiles continue to use LG's live flag; this is not an assumed ban on every Dolby signal variant.

## Remaining verification

Storage dimensions have been checked against native descriptions for the 47 managed banks. That establishes which settings share storage, rather than proving processing support under every signal condition. Inactive rows marked `native_rules` use reviewed factory and controller rules; `live` rows additionally use current native visibility/activity. The main remaining live matrix is:

- Expression Enhancer in HDR Game on HDMI 3/4. HDMI 1 PC HDR Game was checked at 60/120/165 Hz, and HDMI 3 HDR Filmmaker at 24/60 Hz, as recorded below.
- Prevent Input Delay on the remaining gaming inputs and physical latency effects. HDMI 1 control availability was checked at 60/120/165 Hz, including VRR comparisons.
- Gamma choices in each SDR Game input, plus movie Gamma under relevant input-processing conditions.
- Real Cinema and TruMotion in SDR, Dolby Vision at 50/60 Hz, and HDR at 50 Hz, with low latency, PC processing and VRR/QMS where applicable. HDMI 3 HDR Filmmaker was checked at 24/60 Hz; Dolby Filmmaker and Cinema Home were checked at 24 Hz.
- Fine Tune Dark Areas' visible effect with VRR, and QFT with source support, including effects on accepted formats. HDMI 1 accepted 4K/165 Hz RGB HDR10 with DSC and VRR; this does not verify other formats or displayed image fidelity.
- HLG versus HDR10 processing restrictions. The collection currently shares their HDR preset banks; common storage does not prove identical processing choices.
- Filmmaker ambient-light behavior and its dependencies across SDR/HDR/Dolby Vision if that control is added to the managed collection. It is not currently a saved standard.

These checks should record actual signal telemetry and native availability, restore any temporary changes, and avoid treating successful storage as proof of an image-processing effect. Physical latency, transfer-curve and sensor behavior require suitable test material or measurement in addition to API flags.

## PC HDR Game verification

The [2026-10-30 PC HDR audit](g6-pc-hdr-audit.json) checked 38 active picture, app-scoped motion, port and Game Optimizer controls on HDMI 1 with an RTX 5090. Each sample compared two stable native value/description snapshots with editor inspections. All signals were 3840×2160 RGB/full-range HDR10 in `hdrGame`.

| Windows test mode | TV-reported rate | VRR metadata | Incoming ALLM | LG settings range | DSC |
| --- | --- | --- | --- | --- | --- |
| 120 Hz, G-SYNC on | 120 | Enabled | On | `hdrALLM` | Off |
| 120 Hz, G-SYNC off | 120 | Absent | Off | `hdrALLM` | Off |
| 60 Hz, G-SYNC off | 60 | Absent | Off | `hdr` | Off |
| 165 Hz, G-SYNC off | 164 | Absent | Off | `hdrALLM` | On |
| 165 Hz, G-SYNC on | 165 | Enabled, base 165 | On | `hdrALLM` | On |
| Restored 120 Hz, G-SYNC on | 120 | Enabled | On | `hdrALLM` | Off |

Control availability did not change between these samples. LG disabled Expression Enhancer, Peak Brightness, ordinary contrast/black-level/color/sharpness, Real Cinema and TruMotion. OLED Pixel Brightness, HGiG and the separate Game Optimizer controls were available. Native `gammaLevel` remained flagged active despite its disabled Gamma parent; the editor's HDR restriction correctly excluded it. No applicability correction was required for these cases.

Prevent Input Delay offered Standard/Boost (`auto`/`on`) at every tested rate; this does not measure a latency benefit. Fine Tune Dark Areas remained available when source G-SYNC was off while the TV port's VRR & G-SYNC setting stayed on. Do not infer its availability solely from incoming VRR metadata. Likewise, the incoming ALLM flag is not a substitute for Settings Service's authoritative storage dimensions.

Picture values matched the saved standards: backlight 100, HGiG, Game Contrast 100, Game Black Level 50, Game Color Depth 50, Game Sharpness 0, stabilizers 10/10 and Fine Tune Dark Areas 0. The only temporary TV change was enabling 165 Hz boost through Home Assistant. Boost was restored to off; the original document, preferences, revision, management state and empty adjustments were verified after returning to 120 Hz HDR with G-SYNC.

These are signal and control-applicability checks, not displayed chroma, bit-depth, gradation, latency or Atmos measurements. In his [G6 review at 12:45](https://www.youtube.com/watch?v=VfD9sOYhDiQ&t=765s), HDTVTest found poorer gradients, some black crush and reduced chroma detail with 165 Hz mode. That review used firmware 43.10.69; this audit uses 43.21.69 and does not establish whether those image-quality findings persist.

## Selecting the right context

### HDMI 3 HDR movie verification

The [2026-10-30 HDR movie audit](g6-hdr-movie-audit.json) checked the NVIDIA Shield playing the same HDR10 movie at 24 Hz with Plex frame-rate switching enabled and 60 Hz with it temporarily disabled. Both captures showed 3840×2160 YCbCr 4:2:2/limited, `hdrFilmMaker`, the ordinary `hdr` bank and no incoming ALLM. Active QFT was false even though the shared HDMI 3 QFT setting was on.

All 32 managed values and controls in the picture, app-scoped motion, port and preset-selection banks matched the native scopes and descriptions in both samples. Picture values matched the dark-room standards: OLED brightness/contrast 100, black level/color 50, sharpness 0, Peak Brightness High, Real Cinema On, TruMotion Off, tone mapping Off and Expression Enhancer Off. No TV setting was changed during these captures.

Expression Enhancer was editable with Off/Detail/Brightness choices. Peak Brightness, Real Cinema and TruMotion were also editable; Game Genre and Prevent Input Delay were disabled for the movie context. HDR tone mapping offered On/Off and hid HGiG. The editor correctly excluded Gamma and its dependent fine adjustment, and inactive SDR/Game banks did not inherit movie availability as live evidence.

The grouping check used the real saved collection and inspections: ordinary picture controls appeared once for the shared Apple TV/Shield movie bank; Real Cinema appeared under Motion while retaining its picture-bank target; TruMotion retained the `com.webos.app.hdmi3` binding; HDMI connection settings stayed port-wide across formats. No grouping or applicability correction was required for these samples.

Filmmaker Ambient Light Compensation was natively visible/active and stored Off. This confirms control availability for these signals, not sensor behavior; it remains outside the saved collection. Native de-judder/de-blur flags were active while TruMotion was Off, so raw flags alone would incorrectly imply those values are in use. Their editor policy requires TruMotion User Selection. They are not currently saved controls.

### Matching live and saved profiles

Factory metadata is resolved for the **target** bank, not whichever source is currently playing. Metadata for a current SDR movie must not enable HDR gamma, disable an inactive HDR brightness control, or offer movie-only choices in Game.

Live flags are used only when the input, preset/range, game genre and HDMI application match the requested bank and the bridge confirms a ready signal. Calibration and native brightness/color/clarity group locks also apply in that context. A context change during inspection aborts that inspection.

Unknown controller revisions remain read-only until their policies are reviewed. The firmware fingerprint is checked once per service lifetime; existing MQTT live controls retain their own native validation path.

## Editing and recovery

Both single-bank and combined edits validate applicability before committing standards. Combined edits validate the completed candidate and every target before the first persistent write. A failed later target cannot partially commit earlier edits. Shared brightness preferences validate their full affected set. Keeping temporary adjustments also checks applicability before promoting them.

The editor refreshes its capability cache on explicit refresh, profile revision, TV context/instance, or room-variant changes. Changes between inspection and saving are rechecked on the TV. Import/export and power-cycle recovery preserve the existing saved document; inapplicable historical values are not silently removed.

The factory files are streamed once on the first editor inspection and only reviewed HDMI metadata is retained in RAM. The model's Precision Detail capability is also read once on demand through Config Service; a missing or failed response is unknown, not a denial. The implementation adds no polling, persistent capability cache, diagnostics file or subscription. Editor inspections add bounded current-value reads to check native locks and scope. App-scoped motion values and their global calibration/group locks are read separately, as LG rejects a mixed app/global request. Ordinary TV startup and picture restoration do not need to load the editor metadata.

## Dolby Vision movie controls

The [2026-10-30 Shield Dolby Vision audit](g6-dolby-vision-movie-audit.json) checked 31 controls in both configured movie presets, Filmmaker (`dolbyHdrCinema`) and Cinema Home (`dolbyHdrCinemaBright`). The source stayed at 3840×2160/24 Hz `DolbyLL`, YCbCr 4:2:2/limited, with no incoming ALLM. Plex frame-rate matching was re-enabled after the HDR10 60 Hz comparison.

Both presets disabled HDMI Black Level, Color Gamut and Gamma, and enabled Real Cinema, Peak Brightness and TruMotion. The Gamma fine-control flag stayed active despite its disabled parent; the editor correctly excluded it. Dolby Precision Detail remained model-disabled. Filmmaker Ambient Light Compensation was visible/active only in Filmmaker and remained off. The picture, motion, port and preset-selection storage dimensions were unchanged between presets.

This exposed the inactive HDMI Black Level bug fixed in 0.15.3: factory metadata permitted editing that control before Cinema Home was active, but the live controller disabled it. Inactive Dolby Vision HDMI range controls now require native confirmation; saved values and other formats retain their existing behavior. The fix applies to both the TV and Home Assistant editors through the bridge's shared applicability response, with no additional polling or persistent capability writes.

Cinema Home was selected through Home Assistant as a temporary adjustment. Filmmaker was restored through the exact mapping scope, and the original document, revision, preferences, management state and empty adjustments were verified. Only preset selection changed; no picture standards were edited.

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
