# Picture setting descriptions

The shared TV/Home Assistant editor displays short explanations beneath setting names. They explain what a control changes, distinguish similar controls, and mention relevant tradeoffs. The text is bundled with the editor and requires no extra TV requests, subscriptions, logging or storage writes. Each input references its row's explanation with `aria-describedby`; the explanations add no remote-navigation stops.

The descriptions do not recommend or change standards. The editor now checks [profile applicability](setting-availability.md) as well as native writable values and ranges. Inapplicable and unverified combinations are excluded from editable controls; their saved values remain in the backup.

## Sources and verified meanings

The wording was checked against LG's own Settings and Game Optimizer apps on an OLED77G6WUA running firmware **43.21.69 / webOS 11.2.0**. Read-only inspection of these installed files provided the current model's help text and value labels:

- `/usr/palm/applications/com.palm.app.settings/main.js`
- `/usr/palm/applications/com.webos.app.gameoptimizer/main.js`

Public references corroborate the picture-processing descriptions: [LG's brightness help](https://www.lg.com/us/support/help-library/screen-brightness-changes-on-its-own-CT10000018-20154712672872), [LG's picture-settings guide](https://kr.eguide.lgappstv.com/manual/w23_mr11/w23_us01/enga.html), and [LG's explanation of Dolby Vision with Precision Detail](https://www.lg.com/uk/why-lgoled/cinema/). The older public guide is a terminology reference, not evidence that every option is available on every model. Current availability and the mappings below were checked on the G6 itself.

| Native key | Meaning confirmed in LG's G6 UI |
| --- | --- |
| `dolbyPrecisionDetail` | Additional clarity/contrast processing for Dolby Vision. It does not enable or disable Dolby Vision decoding. |
| `expressionEnhancer` | HDR contrast processing for foregrounds, backgrounds and objects. `detail` is Detail; `highlight` is Brightness. |
| `nearBlackDetail` | Rendering of detail in dark picture areas. It belongs to the ordinary input/preset bank. |
| `gamma` | `low` = 1.9, `medium` = 2.2, `high1` = 2.4, `high2` = BT.1886, `mediumHavingLevel` = adjustable 2.2. |
| `gammaLevel` | Fine adjustment shown by LG only for `mediumHavingLevel`. The editor describes that dependency rather than claiming every stored offset takes effect. |
| `colorTemperature` | Negative values are Warm; positive values are Cold. −40 is Warm 40. |
| `gameOptimization` | **VRR & G-Sync** on this G6. This key is not the master Game Optimizer picture-mode switch. |
| `inputOptimization` | **Prevent Input Delay (Input Lag)**: `auto` = Standard; `on` = Boost. LG limits Boost to the Game Optimizer picture mode. |
| `lowLevelAdjustment` | Fine Tune Dark Areas, associated with VRR/FreeSync. Separate from ordinary Black Level and Near Black Detail. |
| `enableQFT` | Quick Frame Transport requires source support. LG explicitly notes possible restrictions on resolution and Dolby Vision. |
| `enable144HzBooster` | The native key retains its old name; the G6 supports a 165 Hz mode. The source must support the corresponding rate. |

The descriptions deliberately make no unverified claims about exact input-lag savings, measured brightness, Dolby processing algorithms or which numeric near-black adjustment is optimal. Native keys, option values, profile targets and write behavior remain unchanged.

## Availability audit on 2026-10-30

LG's Settings UI takes `ui.visible` and `ui.active` from `getSystemSettingDesc`, then applies additional conditions such as the ISF calibration lock. The description is for the current context. Earlier versions expanded that metadata to allow editing inactive banks. The editor now resolves applicability for each target and respects live locks when the target is active; successful storage/readback is not treated as proof of processing support.

The TV reports board `O26_ATSC_US`, firmware 43.21.69 and SDK 11.2.0. Its native Settings app renames `dolbyHdrCinema` to **FILMMAKER MODE** when `tv.hw.turnkeyVersion` is `LG` and `tv.hw.panelResolution` is `UD` or `8K`. Both conditions match this G6 (`LG` / `UD`). The editor therefore labels that existing bank **Dolby Vision Filmmaker**; no bank ID, mapping or saved value changes.

Read-only inspection of `/etc/palm/description.json` and `/etc/palm/override.json` found:

| Setting | Native rule and its limits |
| --- | --- |
| Dolby Precision Detail | Verified on 2026-10-30: the G6 model configuration reports `tv.model.dolbyVisionPrecisionDetail: false`, and the control is hidden/inactive in all six offered Dolby presets. The actual environment is `_O26_`; the old `_O22_` whitelist does not apply. See the [live verification matrix](setting-availability.md#dolby-vision-precision-detail-verification). |
| Filmmaker Ambient Light Compensation | For platform version 11, the static rules expose it in `filmMaker`, `hdrFilmMaker` and `dolbyHdrCinema`; other presets retain a hidden/inactive baseline. Dynamic conditions can restrict this further. |
| Real Cinema | The static rules disable it in SDR, HDR and Dolby Vision Game presets. The native controller also consults scan type, frame rate, low-latency state and VRR/QMS. |
| Peak Brightness | OLED rules show but lock it in SDR Game, while permitting HDR Game. The controller additionally checks ALLM and the current input/preset. |
| Gamma fine adjustment | The Settings UI displays the fine slider only when `gamma` is `mediumHavingLevel` (adjustable 2.2). |
| Expression Enhancer | The static baseline is hidden. The current native controller updates its visibility/activity using HDR type and input dimension, so the static table alone is insufficient. |

The controller observations come from read-only inspection of exported functions in `/usr/lib/libpqc-ux-plugin.so.1.0.0`, including `pq_ux_setExpressionEnhancerMenuInfoToDB`, `pq_ux_setRealCinemaMenuInfoToDB` and `pq_ux_setPeakBrightnessMenuInfoToDB`. This identifies UI dependencies, not a complete specification of the picture-processing algorithms. The separate all-preset Precision Detail audit temporarily changed and restored preset selection.

[Dolby's technical explanation](https://professionalsupport.dolby.com/s/article/Dolby-Vision-IQ-Content-Type-Metadata-L11) identifies **Light Sense** as Dolby Vision IQ's ambient-sensor adaptation. That does not by itself establish that LG's separate Precision Detail toggle requires the sensor or AI Brightness to be enabled. The G6 UI code we inspected does not express such a dependency; the full processing path remains unverified.
