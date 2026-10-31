# Applicability in the picture standards editor

The editor edits saved standards for their target input and preset, including inactive profiles. A verified profile does not lose its supported controls when another input or format starts playing. Inapplicable and genuinely unaudited values are excluded from editable rows and combined edits, with a collapsed explanation. Existing standards and backups retain those values; opening the editor never migrates, deletes or applies them. The TV must be awake for native reads and writes, but the target source need not be active.

## Sources of evidence

The implementation combines read-only inspection of the G6's files with its current native descriptions:

- `/etc/palm/description.json` supplies base types, ranges, choices and hardware conditions.
- `/etc/palm/override.json` supplies the input/preset/range overrides, including individual choices that should be hidden or disabled.
- `/var/luna/preferences/environmentCondition` identifies the hardware conditions used by Settings Service.
- `/usr/palm/applications/com.palm.app.settings/main.js` adds dependencies such as adjustable 2.2 gamma, TruMotion User Selection, calibration locks and picture-group locks.
- `/usr/lib/libpqc-ux-plugin.so.1.0.0` adds runtime picture-controller policy. Its reviewed SHA-256 is `21f216519afd0db4dc7a57e0a086217634835afc3a74e094a4cc392a07709589`.
- [`profile-rules.js`](../app/bridge/lib/profile-rules.js) retains the reviewed conclusions of the audits below, keyed by native input, preset and HDMI app, or by physical port. These rules apply only to the verified G6/O26 model and controller fingerprint. They are shipped code, not a transient observation cache.

LG's [published Settings Service source](https://github.com/webosose/settingsservice) explains the layered declarations and why `getSystemSettingDesc` uses current dimensions. The public source is older than the installed TV software; it is supporting context, not an assumption that every implementation detail is unchanged.

The native controller's `pq_ux_setBasicPictureMenuInfoToDB` explicitly disables `brightness`, `contrast`, `sharpness` and `color` while Game Optimizer is active. The editor therefore offers the corresponding Game Optimizer controls for Game presets. Other reviewed restrictions include SDR-only gamma, SDR Game Peak Brightness, Game Real Cinema, Filmmaker Ambient Light Compensation and HGiG choices in Game presets.

Precision Detail cannot be declared supported from a saved value or hidden factory baseline. The explicit model capability denial excludes it for every preset. Expression Enhancer is verified for console HDR Game and HDR Filmmaker, and excluded for PC Game. Prevent Input Delay and Game Genre are verified port preferences used during Game Optimizer; a movie's currently disabled control does not prevent saving those port preferences for gaming.

The four audited SDR profiles retain Gamma choices `high2` and `mediumHavingLevel`, and the −3…+3 fine control for adjustable 2.2, even when inactive. Their obsolete factory choices `low`, `medium` and `high1` remain rejected. The fine-control dependency is checked against the completed proposed standard, so a batch can change Gamma and its fine adjustment together. HDR/Dolby Vision Gamma remains inapplicable; existing historical values are preserved.

The two audited Dolby movie presets retain their exclusions for HDMI Black Level and Color Gamut. An unrelated active signal or permissive factory description cannot enable those controls for these targets. This rule covers the reviewed native profiles, not every possible Dolby preset on every input.

The six audited PC/Switch/PS5 SDR/HDR Game profiles retain their exclusions for Peak Brightness, Dynamic Contrast, Noise Reduction, MPEG Noise Reduction, Smooth Gradation and TruMotion. PC Game additionally excludes Dynamic Color and Super Resolution. TruMotion rules preserve the exact HDMI app binding. In 0.15.6 these reviewed rules replace the former requirement to reactivate a known profile just to confirm the same exclusions.

Audited controls report `source: audited`. Where a matching live description exists, `current_available` separately reports whether LG currently enables its native control; it does not erase support for a valid saved standard. Calibration and picture-group locks still protect the matching preset. Reviewed factory rules cover other known controls, and live descriptions can describe genuinely unaudited active contexts. A different firmware/model or an unaudited target cannot borrow these G6 rules. Audit JSON files retain the original observations and editor behavior of the version under test; they are evidence for the current rules, not a current UI snapshot.

The [0.15.6 inactive-edit verification](g6-inactive-editor-audit.json) checked 21 banks through the Home Assistant editor API after installation. While PS5 remained at 4K/60 HDR on HDMI 4, one combined save changed the inactive HDMI 1 PC and HDMI 3 Switch SDR Gamma fine adjustments from 0 to 1. Exact native reads confirmed both target banks, and a second save restored both to 0. All five active PS5 banks remained unchanged, the complete standards/preferences/adjustments were restored, and HA acknowledged the final backup. Each batch produced one standards revision (8 → 9 → 10). No input selection or forced picture mode was needed.

## Remaining verification

Storage dimensions have been checked against native descriptions for the 47 managed banks. That establishes which settings share storage, rather than proving processing effects under every signal condition. The remaining signal tests can refine the reviewed rules without making already verified inactive profiles uneditable. The main remaining live matrix is:

- PS5 controls at 120 Hz and with VRR, particularly Expression Enhancer, Gamma and Prevent Input Delay. All three configured gaming inputs now have SDR checks at 60 Hz; Switch and PS5 have HDR checks at 60 Hz. HDMI 1 PC HDR Game was checked at 60/120/165 Hz, including VRR comparisons. These samples do not establish every console signal variant.
- Physical latency effects of Prevent Input Delay. Native Standard/Boost availability was checked on every configured gaming port; this does not measure a benefit at any particular frame rate.
- Full control-availability comparisons for 4K Dolby Vision at 60 Hz in Filmmaker/Cinema Home, particularly Real Cinema and TruMotion; 50 Hz formats remain optional if used. HDMI 3 SDR and HDR Filmmaker were checked at 24/60 Hz, and both Dolby movie presets at 4K/24 Hz. An earlier [Apple TV capture](g6-dolby-vision-60hz-observation.json) already verified 1080p/60 Dolby Vision in Filmmaker and recorded its saved values. It included five control descriptions, but not the native visibility/activity flags for Real Cinema, TruMotion, HDMI range or Color Gamut. Dolby Vision at 60 Hz must not be described as wholly untested.
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

## Nintendo Switch 2 Game verification

The [2026-10-30 Switch audit](g6-switch-game-audit.json) checked 37 SDR and 39 HDR managed controls on HDMI 3. Both games supplied 3840×2160/60 Hz RGB/full range with incoming ALLM and Game Optimizer active. LG selected the `sdrALLM`/`hdrALLM` storage ranges and Standard game genre. Values, dimensions and active editor availability matched two stable native captures per mode.

SDR recalled OLED brightness 80, Game Contrast 95 and adjustable-2.2 Gamma with fine offset 0. HDR recalled brightness 100, Game Contrast 100 and HGiG. Both recalled Game Color Depth 50, Game Sharpness 0, Game Black Level 50, stabilizers 10/10 and Fine Tune Dark Areas 0. The ordinary picture contrast/black-level/color/sharpness controls were disabled; the editor correctly used the separate game values, scoped by port, native range and genre. Shared SDR brightness continued to cover all three gaming inputs, while HDR brightness remained independent.

Expression Enhancer was enabled in Switch HDR with Off/Detail/Brightness choices, unlike the earlier PC HDR samples. Its stored Off value was preserved. Prevent Input Delay offered Standard/Boost in both formats; Boost was saved. Peak Brightness, Dynamic Contrast, both noise-reduction controls, Smooth Gradation, Real Cinema and TruMotion were inactive. SDR Gamma exposed the correct G6 choices and −3…+3 fine control; HDR excluded both Gamma controls despite LG leaving the child flag active.

Comparing the same Game profiles while inactive and active exposed 11 incorrectly editable rows across six processing settings. Version 0.15.5 initially required runtime verification; 0.15.6 retains the audited exclusions without requiring those profiles to stay active. Reviewed controller calls include `pq_ux_VideoInfo_isLowLatencySignal`, `pq_ux_getautoLowDelayMode`, `pq_ux_isGameOptimizationMode` and `pq_ux_isEnableTruMotion`. The fix adds no polling or persistent capability writes, preserves saved standards and leaves verified movie processing controls available.

The TV reported `vrrEnabled: true` with `baseRefreshRate: 0`; that metadata does not independently establish variable frame delivery. QFT was configured On but the reported incoming `qftEnabled` was false; DSC was off. This audit does not measure latency, image processing or VRR performance. The user changed games; the audit did not change picture settings, and standards, preferences, management state and empty adjustments stayed intact.

## PlayStation 5 Game verification

The [2026-10-30 PS5 audit](g6-ps5-game-audit.json) checked 37 SDR and 39 HDR controls on HDMI 4 with bridge 0.15.5. Both signals were 3840×2160/60 Hz RGB/full range with incoming ALLM and Game Optimizer active, using the `sdrALLM`/`hdrALLM` storage ranges and Standard genre. Two native captures per sample matched the editor's values, scopes, ranges and availability.

SDR recalled brightness 80, Game Contrast 95 and adjustable-2.2 Gamma at fine offset 0. HDR recalled brightness 100, Game Contrast 100 and HGiG. Both recalled Game Color Depth 50, Game Sharpness 0, Game Black Level 50, stabilizers 10/10 and Fine Tune Dark Areas 0. The real-document grouping checks verified that the separate Game Optimizer values replace the inactive ordinary picture controls, shared SDR game brightness still covers all three inputs, and HDR brightness retains its own input/preset scope.

Expression Enhancer was enabled in PS5 HDR with Off/Detail/Brightness choices and remained Off, matching Switch HDR rather than the PC HDR samples. Prevent Input Delay offered Standard/Boost in both formats; HDMI 4 retained its saved Standard (`auto`), while HDMI 3 uses Boost (`on`). The inactive-versus-active comparison found no incorrectly editable processing controls: the 0.15.5 runtime guards covered the newly tested port correctly. No additional applicability or grouping fix was required.

Neither sample contained `hdmiVrrInfo`, and both remained at 60 Hz. This does not verify PS5 120 Hz or VRR-specific availability, nor measure latency or processing effects. QFT and DSC were off. The user restored HDR after the SDR sample; the final capture confirmed HDR10 gameplay, unchanged standards/preferences/management, no temporary adjustments or pending restores, and an acknowledged backup.

## Selecting the right context

### HDMI 3 HDR movie verification

The [2026-10-30 HDR movie audit](g6-hdr-movie-audit.json) checked the NVIDIA Shield playing the same HDR10 movie at 24 Hz with Plex frame-rate switching enabled and 60 Hz with it temporarily disabled. Both captures showed 3840×2160 YCbCr 4:2:2/limited, `hdrFilmMaker`, the ordinary `hdr` bank and no incoming ALLM. Active QFT was false even though the shared HDMI 3 QFT setting was on.

All 32 managed values and controls in the picture, app-scoped motion, port and preset-selection banks matched the native scopes and descriptions in both samples. Picture values matched the dark-room standards: OLED brightness/contrast 100, black level/color 50, sharpness 0, Peak Brightness High, Real Cinema On, TruMotion Off, tone mapping Off and Expression Enhancer Off. No TV setting was changed during these captures.

Expression Enhancer was editable with Off/Detail/Brightness choices. Peak Brightness, Real Cinema and TruMotion were also editable; Game Genre and Prevent Input Delay were disabled for the movie context. HDR tone mapping offered On/Off and hid HGiG. The editor correctly excluded Gamma and its dependent fine adjustment, and inactive SDR/Game banks did not inherit movie availability as live evidence.

The grouping check used the real saved collection and inspections: ordinary picture controls appeared once for the shared Apple TV/Shield movie bank; Real Cinema appeared under Motion while retaining its picture-bank target; TruMotion retained the `com.webos.app.hdmi3` binding; HDMI connection settings stayed port-wide across formats. No grouping or applicability correction was required for these samples.

Filmmaker Ambient Light Compensation was natively visible/active and stored Off. This confirms control availability for these signals, not sensor behavior; it remains outside the saved collection. Native de-judder/de-blur flags were active while TruMotion was Off, so raw flags alone would incorrectly imply those values are in use. Their editor policy requires TruMotion User Selection. They are not currently saved controls.

### HDMI 3 SDR movie verification

The [2026-10-30 SDR movie audit](g6-sdr-movie-audit.json) checked 30 managed controls while the Shield played the same movie at 3840×2160/24 Hz and 60 Hz. Both signals were YCbCr 4:2:2/limited with no HDR, ALLM or active QFT, using `filmMaker` and the ordinary `sdr` storage bank. Two native captures per sample remained stable around read-only editor inspections.

All values, native storage dimensions, choices and availability matched in both samples. Gamma offered only `high2` and `mediumHavingLevel`; its fine adjustment was editable from −3 to +3 for the selected adjustable-2.2 option, stored at 0. Inactive SDR Game Gamma stayed unverified, while HDR Gamma remained inapplicable. The active SDR signal did not lend its availability to inactive Dolby or Game profiles.

The dark-room standard was correctly recalled: OLED brightness 3, contrast 95, black level/color 50, sharpness 0, Peak Brightness Off, Real Cinema On and TruMotion Off. Tests of the actual saved document confirmed one shared Apple TV/Shield SDR bank, brightness preferences of dark 3 and bright 100, and a locked standard brightness row that directs editing to the room variants. This checked both variants' grouping and resolution; it did not change the room or measure their brightness.

Real Cinema appeared under Motion while retaining its input/picture-preset storage; TruMotion additionally retained the HDMI 3 app scope. HDMI connection controls stayed port-wide, and the natively inactive Game Genre and Prevent Input Delay controls were excluded. No grouping or availability correction was needed. After Plex frame-rate switching was re-enabled, a final native capture confirmed 4K/24 Hz SDR Filmmaker with the same dark-room values. Standards, preferences, revision and management state were unchanged; there were no temporary adjustments or pending restores.

### Matching live and saved profiles

Factory metadata is resolved for the **target** bank, not whichever source is currently playing. Metadata for a current SDR movie must not enable HDR gamma, disable an inactive HDR brightness control, or offer movie-only choices in Game.

Live flags are used only when the input, preset/range, game genre and HDMI application match the requested bank and the bridge confirms a ready signal. Calibration and native brightness/color/clarity group locks also apply in that context. A context change during inspection aborts that inspection.

Unknown controller revisions remain read-only until their policies are reviewed. The firmware fingerprint is checked once per service lifetime; existing MQTT live controls retain their own native validation path.

## Editing and recovery

Both single-bank and combined edits validate applicability before committing standards. Combined edits validate the completed candidate and every target before the first persistent write. A failed later target cannot partially commit earlier edits. Shared brightness preferences validate their full affected set. Keeping temporary adjustments also checks applicability before promoting them.

The editor refreshes its capability cache on explicit refresh, profile revision, TV context/instance, or room-variant changes. Changes between inspection and saving are rechecked on the TV. Import/export and power-cycle recovery preserve the existing saved document; inapplicable historical values are not silently removed.

The factory files are streamed once on the first editor inspection and only reviewed HDMI metadata is retained in RAM. The model's Precision Detail capability is also read once on demand through Config Service; a missing or failed response is unknown, not a denial. The implementation adds no polling, persistent capability cache, diagnostics file or subscription. Editor inspections add bounded current-value reads to check native locks and scope. App-scoped motion values and their global calibration/group locks are read separately, as LG rejects a mixed app/global request. Ordinary TV startup and picture restoration do not need to load the editor metadata.

## Dolby Vision movie controls

The [2026-10-27 Apple TV observation](g6-dolby-vision-60hz-observation.json) recorded HDMI 3 at 1920×1080/60 Hz `DolbyLL`, Filmmaker (`dolbyHdrCinema`), with Real Cinema On and TruMotion Off. Five native control descriptions were captured, including hidden/inactive Precision Detail. Descriptions for Real Cinema, TruMotion, HDMI range and Color Gamut were not captured, so those stored values do not establish their editability at 60 Hz. This earlier observation was initially omitted from the remaining-test summary; the outstanding detailed comparison is 4K/60 control availability in both movie presets.

The [2026-10-30 Shield Dolby Vision audit](g6-dolby-vision-movie-audit.json) checked 31 controls in both configured movie presets, Filmmaker (`dolbyHdrCinema`) and Cinema Home (`dolbyHdrCinemaBright`). The source stayed at 3840×2160/24 Hz `DolbyLL`, YCbCr 4:2:2/limited, with no incoming ALLM. Plex frame-rate matching was re-enabled after the HDR10 60 Hz comparison.

Both presets disabled HDMI Black Level, Color Gamut and Gamma, and enabled Real Cinema, Peak Brightness and TruMotion. The Gamma fine-control flag stayed active despite its disabled parent; the editor correctly excluded it. Dolby Precision Detail remained model-disabled. Filmmaker Ambient Light Compensation was visible/active only in Filmmaker and remained off. The picture, motion, port and preset-selection storage dimensions were unchanged between presets.

This exposed the inactive HDMI Black Level bug fixed in 0.15.4: factory metadata permitted editing that control before Cinema Home was active, but the live controller disabled it. Version 0.15.4 initially required native confirmation; 0.15.6 retains the reviewed exclusions for both audited Dolby movie profiles while inactive. Saved values and other formats retain their existing behavior. Both editors use the bridge's shared applicability response, with no additional polling or persistent capability writes.

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
