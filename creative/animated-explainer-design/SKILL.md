---
name: animated-explainer-design
description: Use when designing an animated explainer sequence.
---

# Designing an animated explainer sequence

The design half of explainer work: what goes on screen, why it moves, and how you know it landed. The recording / encode pipeline is a separate concern — see the `narrated-html-video` skill for `recordVideo`, TTS and ffmpeg muxing.

Applies to any animated explainer: a rendered video, a hero sequence, an auto-playing deck slide.

## 1. Build the shot around one recognizable subject
- **A lone icon is read as monotone and information-poor.** "Too abstract, I can't tell what that is" is the standard first-round complaint when a concept is drawn literally — a pulsing ring for dopamine instead of a brain, a bare line for an algorithm instead of a rod with a person on the hook.
- Give each shot one unmistakable subject plus 2–3 read-outs attached to it. Information density comes from the read-outs and the interaction, **not from longer copy**.
- Prefer real iconography over hand-drawn geometry when the concept has a physical counterpart. See `references/visual-design.md` for a concept→subject table.

## 2. Every element must earn its place by explaining the line
- Animation is the explanation, not the ornament. For each moving thing ask: *what does this motion tell the viewer that the caption just said?* If the answer is nothing, cut it. (The user's own phrasing: 不是为了动效而动效,要让人看得懂.)
- **Elements must act on each other, not perform solo.** Build causal chains — the algorithm side pushes content → the person accepts or dodges → the read-out changes. A sequence of isolated objects, one per shot with no relationship between them, gets rejected as 分镜太明确 / 相互之间几乎没有联系.
- A scene may legitimately hold several objects when they form one mechanism; the rule is one *focus*, not one *prop*.

## 3. Link the motion on a single shared cycle
- Drive everything from one period constant so the cues land together: swipe → list scroll → item swapped → counter tick as a single event. Independent random loops on each element read as "the animation has no logic".
- Replace CSS `@keyframes` infinite-scroll with a JS roller driven from the same rAF loop when anything else must stay in phase with it. Recipe in `references/visual-design.md`.
- Generate replacement content **at the moment it is swapped in**, so the change reads as "another item arrived" rather than "the box blinked".
- Counters should jump a discrete step per cycle, not increment continuously — a smooth number reads as a stopwatch, a stepping one reads as an event.

## 4. Anchor labels to what they describe
- A data label parked in a screen corner is called out as arbitrary. Put it **next to its subject, inside the subject's wrapper**, with a short leader line pointing back at it.
- Keep labels out of the full-canvas container; a wide shot will push a canvas-anchored label off the edge and it gets clipped.
- Leave extra clearance (~50 px) under a subject that has a float or drift animation, or the label and the body will touch at the extremes of the bob.

## 5. Caption craft
- **Whole-sentence fade in / fade out.** This user explicitly prefers it over per-word karaoke highlighting and over a typewriter reveal.
- Size ~40 px at 1080p, weight ~550, line-height ~1.5, letter-spacing ~0.01 em. Oversized bold slogans are rejected as 太不好看.
- Emphasise keywords by colour plus a soft glow only — no size jump.
- Use a modern CJK sans (`Noto Sans SC`, variable weight) rather than `Microsoft YaHei`, and check `C:/Windows/Fonts` for what is actually installed before choosing.
- Keep the copy short. Trim a sentence before adding a visual.

## 6. Layer the transitions
- A plain cross-fade between shots reads as 生硬. Scale the graphic in from 0.93 → 1 while the caption follows ~0.14 s later, and sweep a diagonal light bar across the cut.
- Give every shot an entrance for both layers (graphic, then text) rather than switching both at once.

## 7. Delivery loop: show the page, then render
- For iterative visual work, **edit the HTML and let the user look before you render.** Hand over an inline `::preview{file="..."}` plus the absolute path and wait for sign-off. Rendering first and re-rendering after every note costs minutes per round for nothing; users will say when they want the render ("我说可以了以后再生成出视频").
- Wrap a fixed-size canvas in a fit-to-container scaler — `transform: scale(min(w/W, h/H))` on an inner wrapper — so it displays whole inside a preview iframe as well as full-screen. At the design resolution the scale is 1, so a later render is unaffected.

## 8. Verify by measuring, not by eye
- **Probe one shot without waiting out the whole timeline:** strip `.active` from every scene, add it to the one under test, then read `getBoundingClientRect()` on its children to prove nothing overflows the canvas. `scripts/scan_scenes.mjs` does this across every scene.
- **Take probe screenshots at absolute times.** Capture a `t0` and compute each wait from it; a chain of relative waits drifts after the first pre-sampling step and the filenames stop matching the scenes they claim.
- **Sample twice inside one cycle** (~400 ms apart) and read the transform values — that proves the animation is cycling rather than frozen, which a single still cannot show.
- **Verify motion on a real, unthrottled page.** Virtual-time screenshot flags can capture mid-transition or pre-activation frames and make a healthy page look blank; a Playwright page with real elapsed time does not.
- Re-run the probe after every fix. Overlapping, clipped and fused elements survive every review that only reads the code.

## Support files
- `references/visual-design.md` — concept→subject table, label leader-line CSS, shared-cycle roller recipe, caption spec, transition recipe.
- `scripts/scan_scenes.mjs` — screenshot every scene at absolute times and report elements leaving the canvas.
- `scripts/fetch_icons.py` — pull open-source SVG icons (Iconify / Phosphor / Material) into an inlinable `window.ICONS` map.
