---
name: narrated-html-video
description: Use when making a narrated video from HTML/CSS animation.
---

# Narrated video from an HTML/CSS animation

Pipeline: single-file HTML animation with a JS timeline → record with Playwright `recordVideo` → generate narration audio → mux with ffmpeg. Works for intros, explainers, product blurbs, title sequences.

## 1. Animation page
- One `<section class="scene">` per beat, absolutely positioned and centered; toggle `.active` from a `requestAnimationFrame` loop keyed on `performance.now()`.
- Stagger child entrances with CSS `transition` plus `.scene.active .dN{transition-delay:...}`.
- **Split the timeline in proportion to the narration sentences** so visuals and voice line up; keep a short (~0.4s) lead-in so page-load delay hides inside it.
- Expose `window.__sceneReady = true` so the recorder can wait for a live page.
- Keep frames cheap for headless software rendering: use `radial-gradient` glows instead of `filter: blur()` on large elements; animate only `transform`/`opacity`. `backdrop-filter` on small cards is fine.
- Apply a deliberate design system (one focal point per viewport, radius proportional to component size, glass only on floating layers, near vs. float shadow tiers, gradient reserved for keywords).

## 2. Recording (Playwright)
```js
const context = await browser.newContext({
  viewport:{width:1920,height:1080}, deviceScaleFactor:1,
  recordVideo:{dir: VIDEO_DIR, size:{width:1920,height:1080}}
});
await page.goto(url,{waitUntil:'load'});
await page.waitForFunction('window.__sceneReady === true');
await page.waitForTimeout(durationMs + 400);
await context.close();   // the .webm is written on close
```
- `npm i playwright` + `npx playwright install chromium`; add `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` when the binary is already cached.
- Output is ~25fps VP8. The first ~1s may be page load — trim with `-ss`, or take the head with `-t`.
- Playwright's Chromium is separate from the `browser_exec` / agent-browser Chromium; installing one does not satisfy the other.
- **Skip the browser download when Edge/Chrome is installed**: `npm i playwright-core` (one package, ~2 s) + `chromium.launch({ channel: 'msedge' })`. No `npx playwright install` needed, and it works on a network where the CDN is blocked.
- **The first recorded frame is usually the browser's white default background**, and `blackdetect` will NOT fire on a dark-but-not-black page background (`#04070d` → YAVG ≈ 7, above `pix_th=0.02`). Never trust blackdetect to locate the start of playback. Measure it: `ffmpeg -t 4 -i raw.webm -vf "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=stats.txt" -f null -`, then read the `pts_time`/`YAVG` pairs — the white frame is YAVG > 100 and playback starts immediately after it.
- Trim with `-ss` = that offset (or a bare `0.04` to drop the white frame); a one-frame A/V offset is invisible. The tail of the recording holds a multi-second freeze, so `video_duration - audio_duration` is NOT the start offset.

## 3. Narration (TTS)
- **Preferred when `MIMO_API_KEY` is set — Xiaomi MiMo TTS:** OpenAI-compatible endpoint `https://api.xiaomimimo.com/v1`, model `mimo-v2.5-tts`; put the style instruction in the `user` message and the spoken text in the `assistant` message; `audio:{"format":"wav","voice":"冰糖"}`. Audio returns base64 in `choices[0].message.audio.data`, 24 kHz mono PCM. Helper script: `%ARTIFACTS%/tools/mimo_tts.py` (reads the key from `MIMO_API_KEY`; the file itself holds no credential). Voices: 冰糖/茉莉 (zh female), 苏打/白桦 (zh male), Mia/Chloe/Milo/Dean (en); also supports dialects, emotion tags, singing, voice design and voice cloning. Speech rate is slower than the Windows machine voice (~4.3 chars/s), so fit it to the target with atempo.
- Otherwise try the built-in `text_to_speech` tool first.
- **Pitfall (Windows, edge provider):** pure-Chinese text can fail with "No audio was received" while a sentence containing Latin letters succeeds, and long mixed text may be truncated at the first Chinese colon. Diagnose with one short known-good sentence — do not retry the same call in a loop.
- **Offline fallback that always works (Windows):** System.Speech with an installed voice.
  - List: `powershell -c "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | % {$_.VoiceInfo.Name}"` (e.g. `Microsoft Huihui Desktop` = zh-CN).
  - `$s.SelectVoice(...)`, then `SetOutputToWaveFile($out)`, `$s.Speak($text)`, `$s.Dispose()`. Output is 22.05kHz mono PCM.
  - **Put the script text in a UTF-8 `.txt` and read it via `[IO.File]::ReadAllText($p,[Text.Encoding]::UTF8)`** — do not inline CJK in the `.ps1`, PowerShell 5.1 mis-decodes BOM-less UTF-8.
- Keep the `.ps1` itself ASCII-only so encoding never bites.

## 4. Length matching + mux
- Measure: `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 in.wav`.
- Fit audio to an exact target: `ffmpeg -i in.wav -filter:a "atempo=<src/dst>" -ar 44100 out.wav` (factor = source/target; 0.5–2.0 stays clean).
- Mux: `ffmpeg -i video.webm -i voice.wav -c:v libx264 -preset medium -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -t <secs> -movflags +faststart out.mp4`

## 5b. Subtitles: give them their own band, don't overlay the picture
A subtitle pinned over the picture covers body text on dense slides — and dense slides are the interesting ones. Reserve a dedicated band:

- Give the page a mode flag (e.g. `body.rec`) and make `fit()` subtract it: `s = Math.min(W/1600, (H - BAND)/900)` with `BAND ≈ 124`. The stage scales down slightly and the band stays empty; the deck is still centred, so no per-slide layout work is needed.
- Put the subtitle element **outside** the transformed container — `position: fixed` inside an element with `transform: scale()` is positioned relative to that element, not the viewport.
- Paint the band with the deck's own background colour so picture and band read as one surface; add a hairline gradient at the top edge. On a dark deck the letterbox edges are invisible, so this costs nothing aesthetically.
- 34 px type in a 124 px band holds one line comfortably, two lines at a squeeze — cut subtitle lines to ≤ 26 CJK chars.
- **Never animate a scene in from `opacity: 0`.** A 0.45 s fade from full black reads as a flicker on every scene change, and shows up as a black frame in any contact sheet. Start at ~0.55 and shorten to ~0.34 s; the shared background layer keeps the picture alive across the cut.
- Font metrics: a CJK char at `font-size: N px` is ~`N px` wide, so `line_width ≈ chars × font-size` — use that to size the band before rendering.

## 6. Music-only variant (kinetic typography, no narration)
When the brief asks for pure visual typography plus BGM instead of a voice-over, keep the same pipeline but **synthesize the music in code** — that is what makes beat-syncing possible, because you then know every beat timestamp exactly.
- Synthesis with numpy/scipy: one synth function per voice, placed on a beat grid — kick = pitch-dropping sine (`f = 125*exp(-t*20)+42`); snare = bandpassed noise + 190 Hz body; hat = highpassed noise with fast decay; bass = summed harmonics of the root + lowpass; pad = detuned sines per chord tone; pluck = decaying harmonics. Normalize to ~0.89 peak, add 0.5 s fade-in and 2.5 s fade-out.
- Pick the BPM so that beats × seconds-per-beat lands on the target: 96 BPM → 96 beats = exactly 60.0 s (0.625 s/beat).
- Put **every scene boundary and every word reveal on a beat**; trigger a screen shake (re-add a CSS shake class with a forced reflow) from keyword reveals so the emphasis lands on the downbeat.
- Kinetic typography pattern: words are `<span class="w">` starting at ~20% opacity; a rAF loop adds `.on` when the beat for that word has passed. Keywords get a second class that enlarges them and applies a cyan/red glow.
- Confirm the audio is not silent: `ffmpeg -v info -i x.wav -af volumedetect -f null -` (needs `-v info`, otherwise nothing prints).

### Data labels must belong to something
- Anchor every number to the object it describes: wrap the subject in `.subj{position:relative}` and place labels with `.info{position:absolute;left:100%}` / `right:100%`, plus a short leader line. Labels pinned to the four screen corners read as decoration; labels beside their subject read as evidence.
- Make the numbers respond to what happens on screen: when a ✓ appears the score must rise on that beat, when ✕ appears it must fall. A stat that never changes is worse than no stat at all.
- Sync every per-item motion (list scroll, counter steps, highlight moves) to ONE shared period (e.g. 4 beats = 2.5 s at 96 BPM). Independent random loops read as noise rather than cause and effect.
- Drive list scrolling from JS instead of a CSS loop: advance `translateY` with an ease inside the shared period, then at the end of the travel remove the first child and append a freshly generated one, so "the card that scrolled away" visibly becomes new content.
- Open with a single line of type if the piece needs a cold open — one big sentence alone on black, typed out, reads as an intentional opening; jumping straight into content reads as a missing one.
- Scan every act before rendering: sample one frame per act and check each label's `getBoundingClientRect()` stays inside the canvas. A label positioned against the full-bleed canvas will be clipped at the edge.

## 7. Verify before delivering
- Contact sheet: `ffmpeg -i out.mp4 -vf "fps=1/<secs_per_frame>,scale=512:-1,tile=5x2" -frames:v 1 sheet.png`, then read it with `vision_analyze`.
  - **`fps=1/N` + `tile` lies to you.** When the grid has more cells than output frames the trailing cells are black, and the sampler's phase is not what you assumed — a black cell gets reported as "scene 7 renders black" when scene 7 is fine. Sample deterministically instead: one `-ss <beat midpoint> -frames:v 1` per beat into `NNN.png`, then `ffmpeg -i "%03d.png" -vf "scale=480:-1,tile=4x3"`. `-pattern_type glob` is not compiled into every ffmpeg build, so renumber to a sequence rather than relying on it.
  - Cross-check any suspicious frame with `signalstats` YAVG before believing it. Across all beats YAVG sits in a narrow band (e.g. 31–38 for a dark deck); a genuinely black frame is < 5. One frame of a dark-themed deck is not evidence of a black scene — sample the actual timestamp first.
- Sample densely enough to hit every scene (e.g. `fps=1/3` for a 30s clip) — sparse sampling makes scenes look missing when they are fine.
- Confirm scene order, legibility, no overlap, and that the visual beats match the narration sentences.
