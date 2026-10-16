---
name: motion-graphics-explainer
description: Use when a motion-graphics scene must make an idea obvious.
---

# Motion-graphics scenes that explain themselves

The governing rule: **a viewer must be able to name each scene's subject within one second, and the motion must demonstrate the sentence.** Abstract geometry placed under a caption is not communication — it reads as decoration and gets rejected. Everything below serves that rule.

The rendering pipeline (HTML/CSS timeline → Playwright `recordVideo` → TTS or code-synthesised BGM → ffmpeg mux) lives in the `narrated-html-video` skill; this skill is the visual layer that decides whether the result is legible.

## 1. One recognizable central subject per scene
- Give each scene a **single large figure**, roughly 260–330 px in a 1080p frame, that a stranger could name out loud: a phone, an eye, a brain, a fishing line, a spiral, a pickaxe, a padlock, a power symbol.
- Never distribute a scene across several small abstract shapes — that is the shape of the failure the user will call out as “看不出是什么”.
- Choose the subject by asking “what would a child draw for this word?”, not “what looks techy”. A concept→subject table that read instantly to a viewer is in `references/icons-and-typography.md`.
- If a scene's subject is a familiar object (a phone), render the object's **real interface** rather than a wireframe — a short-video UI with avatar, follow pill, content cards and a heart/comment rail is instantly legible where a grey rectangle is not.

## 2. Bind every animation to the meaning
- For each moving element, write the one-clause justification: “blocks drop onto the figure → 投喂”, “particles leave the brain → 多巴胺”, “the person swings on the hook → 算法钓住你”, “the pickaxe strikes ore → 被开采”. **If you cannot state it, cut the effect.**
- Keep motion on `transform` / `opacity` / `background-position` only — headless software rendering punishes `filter: blur()` over large areas. A vocabulary that carried weight without blur is listed in the reference file.
- Emphasis ladder, most to least restrained: **colour only → colour + scale → colour + scale + screen shake.** Start at colour only; escalate to shake only when the brief explicitly asks for punch.
- Transition between scenes with layered timing instead of a hard cut: the graphics layer scales/fades slightly ahead of the text layer (≈0.14 s later), plus a light sweep across the frame at each switch.

## 3. Use real open-source iconography for abstract concepts
- Fetch from the Iconify API and inline the SVGs — see `scripts/download_icons.py`. Sets to prefer: **Phosphor** (`ph`, MIT) and **Material Design Icons** (`mdi`, Apache-2.0); both are fill-based, so `fill="currentColor"` lets CSS drive every colour.
- **Send a User-Agent** — the API returns `403` for Python's default `urllib` UA while `curl` succeeds. **Check for `404`** before designing around an icon; a miss renders an invisible gap, not an error.
- `viewBox` differs per set (`ph` = `0 0 256 256`, `mdi` = `0 0 24 24`): read it from the fetched SVG and carry it through.
- Mount via a `data-icon` attribute filled from a local `window.ICONS` map; the page must not depend on the network at record time. A classic (non-module) `<script src="icons.js">` loads over `file://`.

## 4. Subtitle typography (CJK, 1080p) — standing preference for this user
- Face: `"Noto Sans SC"` (variable weight; on this machine `C:\Windows\Fonts\NotoSansSC-VF.ttf`) → `"Source Han Sans SC"` → `"Microsoft YaHei UI"`. Plain `"Microsoft YaHei"` reads dated next to a geometric UI; the user will call it out.
- **≈40 px, weight ≈550, line-height ≈1.55**, one line per beat, generous letter-spacing, ≈132 px up from the bottom. Bigger is not better here — 56 px+ was rejected as “不好看”.
- When the brief asks for restraint, reveal the **whole line with a fade plus a small rise**, and drop per-word karaoke *and* typewriter effects entirely. Emphasis then rides on colour alone (cyan `#5ec8ff` / red `#ff5d6c` + soft glow), not on enlargement.
- Keep captions short — aim for ≤12 characters per beat so each line reads as one clause.
- **Never buy subtitle space out of the picture.** Overlaying captions on a full-bleed frame (as above) is fine; reserving a band *under* the canvas is not. A 124 px band forces a 1600×900 stage to scale from 1.20 down to 1.06, and the user's first note on the finished file will be that the subject got smaller (台词导致整个主体变小了). If a band is genuinely required, present it as a trade the user chooses — never as the default.
- **Assume no on-screen captions on a narration-led piece** — a voice-over carrying a designed deck already delivers every sentence, and a band costs real legibility on its dense slides. Offer captions as an option; ship full-bleed otherwise.

## 5. Timing
- Put scene boundaries and emphasis hits **on a musical beat**. When you synthesise the BGM in code you know every beat timestamp exactly, which is what makes true sync possible (recipe in `narrated-html-video` §5).
- Choose the BPM so that beats × seconds-per-beat lands on the target duration.

## 6. Verify frames — the only way to see the result
- **Per-scene contact sheet**, one frame at each scene's stable moment: `scripts/contact_sheet.py in.mp4 out.png 3 8 13 18 ...`. Uniform `fps=1/N` sampling lands twice inside a long scene and skips short ones, which reads as “a scene is missing” when it is not.
- Read the sheet with `vision_analyze` and ask specifically whether each scene's **central subject is identifiable** and the subtitle legible — “does it look ok” returns useless praise.
- **Check the last frame separately.** Endings are where stale overlays, low-contrast text and mid-fade elements hide.
- **Time-window every overlay.** A full-frame dim used for an “off” beat must be cleared by the next scene (`if (e >= a && e < b) on; else off;`) — left on, it silently crushes the final title's contrast.
- **Do not let HUD decoration read as UI noise.** A row of small dots or counters along the bottom gets reported back as “page numbers”; keep at most a thin progress bar unless the beat indicator is genuinely the point.
- **Probe before a long record.** `scripts/probe.mjs` opens the page in real time, waits a few seconds, screenshots and reports mounted-icon counts plus the active scene — seconds instead of a two-minute encode. Edge's `--headless --virtual-time-budget` screenshot is not a substitute: its virtual clock does not advance CSS transitions reliably and can return a blank frame for a page that renders fine.
- **Get the shape signed off before the record, not just the code checked.** Capture is real-time — a 5 min piece costs 5 min of capture plus the encode — so any layout or placement change after it costs the whole record again. Probe with the real timeline injected to approve *full-bleed vs. band, label placement, scene-in brightness* first. Narration edits stay cheap throughout, because the audio track is rebuilt independently of the capture.
- **Find the true start of playback by measurement.** A recording opens on the browser's white default background, and `blackdetect` will not fire on a dark-but-not-black page (`#04070d` → YAVG ≈ 7, above `pix_th=0.02`), so it cannot locate where playback begins. Use `ffmpeg -t 4 -i raw.webm -vf "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=stats.txt" -f null -` and read the `pts_time`/`YAVG` pairs — the white frame is YAVG > 100 and playback starts immediately after; trim with `-ss` at that offset (or a bare `0.04`). The tail carries a multi-second freeze, so `video_duration - audio_duration` is not the offset.
