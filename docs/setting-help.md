# Picture setting descriptions

The shared TV/Home Assistant editor displays short explanations beneath setting names. They explain what a control changes, distinguish similar controls, and mention relevant tradeoffs. The text is bundled with the editor and requires no extra TV requests, subscriptions, logging or storage writes. Each input references its row's explanation with `aria-describedby`; the explanations add no remote-navigation stops.

The descriptions do not recommend or change standards. The existing native metadata still determines writable values and ranges. A saved setting may be editable for an inactive bank even when its effect requires a particular signal or another setting to be enabled.

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
