# Reviewer settings notes

The editor keeps the G6 recommendations from RTINGS and HDTVTest as reference notes (0.23.0). They
are text only. Nothing applies them, and no TV request or saved value is involved.

- **On a setting's page**, a short note sits under the description for each setting a reviewer
  covers, for example Contrast: `RTINGS SDR Filmmaker 95 · HDR Filmmaker 100`.
- **Reviewer settings** (in the header, or **All reviewer settings** under a note) lists every
  recommendation by topic: SDR movies, HDR movies, motion, processing and gaming, followed by the
  sources. With the TV remote each note is a focus stop, so the arrows scroll the page. The TV app
  shows source addresses as text. The Home Assistant panel links to them.

The content lives in `reviewers` in [`app/profile-editor.js`](../app/profile-editor.js). LG Picture
Profiles vendors that file, so the panel shows the same notes.

## Sources

| Source | Date | Basis |
| --- | --- | --- |
| [RTINGS: LG G6 OLED calibration settings](https://www.rtings.com/tv/reviews/lg/g6-oled/settings) | Checked 2026-10-31 | A 65-inch G6. RTINGS says the settings also suit the 55, 77 and 83-inch models and are a starting point for a moderately lit room, not to be copied 1:1. |
| [HDTVTest: LG G6 OLED Review: New Firmware Changes Everything](https://www.youtube.com/watch?v=VfD9sOYhDiQ) | 2026-05-15 | Vincent Teoh's 65-inch G6 on firmware 43.10.69, compared against a Sony BVM-HX3110 mastering monitor. |
| [HDTVTest: LG C6H OLED Review — The 3000-Nit Problem](https://www.youtube.com/watch?v=5zI1VBpUkTc) | 2026-08-31 | A 77-inch C6H, which shares the G6's Alpha 11 Gen3 processor and four-stack panel type, on firmware 43.21.60. Used only for settings that apply to both: OLED Motion and Creator Original Picture Mode. |
| [HDTVTest: This TV Setting Is Ruining Your PS5 HDR Calibration](https://www.youtube.com/watch?v=6h92l5teghw) | 2026-07-31 | The PS5 Adjust HDR procedure with HGiG on an LG OLED. |

HDTVTest's recommendations come from the videos' English captions; HDTVTest has not published a
written G6 settings list. His first-look video (2026-03-04) walks through the menu without
recommending values.

## What is left out

RTINGS publishes its SDR white balance and color calibration and its HDR 2-point white balance.
RTINGS says these vary from unit to unit and shouldn't be copied, so the notes leave them out.
HDTVTest's Calman AutoCal results are measurements of his sample and are also left out.

Two HDTVTest notes depend on his firmware and are marked that way: Near Black Detail −1 and the
HDR Game Optimizer tone-mapping workaround, both on 43.10.69. This G6 reported firmware 43.21.69
in the [2026-10-30 audit](setting-help.md#availability-audit-on-2026-10-30).

## Option names

The notes use the reviewers' wording and the editor's titles. Where the TV stores a different
value, the note gives it: RTINGS' Gamma 2.2 is `mediumHavingLevel` in SDR Filmmaker on this TV
(its only 2.2 option there), Warm 40 is `−40`, Expression Enhancer Brightness is `highlight`,
and TruMotion Cinematic Movement is `cinemaClear`.

## Updating

Edit `reviewers` in `app/profile-editor.js`, then run `tests/check-reviewer-notes.cjs` and
sync LG Picture Profiles' editor (`python3 scripts/sync-editor.py` in that repository).
