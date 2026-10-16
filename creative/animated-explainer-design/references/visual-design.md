# Visual design depth for animated explainers

Companion to SKILL.md. Use when a shot is being called abstract, monotone, or "I can't tell what that is".

## Turning an abstract concept into a subject

The failure mode is drawing the *concept*; the fix is drawing a *thing that names it*.

| Line / concept | Subject that reads instantly | Supporting read-outs |
|---|---|---|
| endless short-video scrolling | a phone showing a real short-video UI (avatar, follow pill, content cards, side rail of heart / comment / share) | swipes today · seconds per view · N queued |
| "it is watching you" | the same phone with an **eye** surfacing through the screen, plus a tracking reticle | N preference tags · tracking locked |
| the algorithm feeding you | **algorithm side** (mini phone emitting items) → dashed track → **person** | feed weight · accept rate · item N |
| dopamine / conditioning | a **brain**, glowing | a spark-line on one side, ascending bars on the other |
| the algorithm hooks you | a **rod** with the line hanging a **person** | N online · hooked for N minutes |
| no bottom | a **spiral** swallowing cards | N consumed · depth ∞ |
| you are the ore | a **pickaxe** striking rock, a conveyor carrying slabs away | N GB extracted · your minutes |
| take back control | a **padlock** straining at its chains | screen time today · daily average |
| switch it off | a **power symbol** pressing down, screen goes dark | autoplay off · minutes saved |

Each read-out should be a *number that moves* (see the shared-cycle recipe), not a static caption.

## Anchoring labels with leader lines

```css
.subj{position:relative;}                 /* the subject's wrapper */
.info{position:absolute;font-variant-numeric:tabular-nums;white-space:nowrap;}
.info::after{content:'';position:absolute;top:50%;height:1px;width:28px;
  background:linear-gradient(90deg,rgba(140,170,220,.5),rgba(140,170,220,.12));}
.t-l{right:100%;margin-right:34px;}  .t-l::after{left:100%;}
.t-r{left:100%;margin-left:34px;}    .t-r::after{right:100%;}
.t-t{left:50%;bottom:100%;margin-bottom:26px;transform:translateX(-50%);}
.t-b{left:50%;top:100%;margin-top:52px;transform:translateX(-50%);}
```
- Put labels **inside the subject wrapper** so they inherit its position. Positioning them against the full-canvas graphic box puts them at the screen edge on a wide shot, where they get clipped.
- `tabular-nums` keeps a ticking counter from jittering the label width.
- The `margin-top:52px` under a floating subject is deliberate — 26 px is not enough once the body bobs.

## Linking animations on one shared cycle

Drive everything from a single period constant; do not give each element its own duration.

```js
var PERIOD = 2.5;                      // 4 beats at 96 BPM
var CARDH  = 106;                      // card height + gap
function driveRollers(e){
  var ph = (e % PERIOD) / PERIOD;
  var p  = Math.max(0, Math.min(1, (ph - 0.06) / 0.5));          // scroll window
  var ease = p < 0.5 ? 2*p*p : 1 - Math.pow(-2*p+2,2)/2;         // accelerate, settle
  rollers.forEach(function(r){
    if (p >= 1) {                                                 // one item consumed
      r.inner.style.transform = 'translateY(0px)';
      r.inner.removeChild(r.inner.firstChild);                     // drop the one that left
      r.inner.appendChild(makeCard());                             // new content, generated now
    } else {
      r.inner.style.transform = 'translateY(' + (-CARDH*ease) + 'px)';
    }
  });
}
```
- The CSS `@keyframes` infinite-scroll version drifts out of phase with the tap ripple, the swipe cue and the counters; drive it from the same rAF loop instead.
- Match one-shot animations (the tap cue, the counter tick) to the same `PERIOD` so every cue lands together.
- Ticking counters: `Math.floor(base + Math.floor(e/PERIOD) * step * PERIOD)` gives a discrete jump per cycle. A smoothly incrementing number reads as a stopwatch, not an event.
- Regression check worth running: read the transform every ~400 ms for a couple of cycles and confirm it ramps to one item height and resets — `0 → -10 → -60 → -101 → 0 → 0`. That pattern *is* the intended behaviour; a value that never returns to 0, or one that jumps randomly, means the phase or the swap is wrong.

## Caption spec

| Property | Value |
|---|---|
| size | ~40 px at 1080p |
| weight | ~550 (variable font) |
| line-height | ~1.5 |
| letter-spacing | ~0.01 em |
| entrance | whole-sentence opacity + 16 px rise, ~0.72 s |
| keyword emphasis | colour + soft glow only (cyan / red), no size jump |

## Transition recipe

```css
.graphic{opacity:0;transform:scale(.94);
  transition:opacity .72s cubic-bezier(.22,1,.36,1),transform .92s cubic-bezier(.22,1,.36,1);}
.scene.active .graphic{opacity:1;transform:scale(1);}
.text{opacity:0;transform:translateY(16px);transition-delay:.14s;}
```
Plus a sweep element fired on each cut: a 44%-wide gradient bar animating `translateX(-140%) → translateX(340%)` over ~0.62 s.

## Iconography

- Pull icons from the Iconify public API and inline the path data through a small `window.ICONS` map mounted on `[data-icon]` attributes. Inlining sidesteps every `file://` subresource and CORS question at record time.
- `scripts/fetch_icons.py` wraps this; **it must send a browser-ish `User-Agent`** — the API answers HTTP 403 to Python's default UA (curl passes by default, which hides the cause).
- Phosphor (`ph:`) and Material Design Icons (`mdi:`) are MIT / Apache-2.0 and cover most concepts; `ph:` has the more contemporary line style, `mdi:` fills gaps such as `fishing` and `pickaxe`.
- Confirm the slots actually mounted rather than trusting the markup — count `[data-icon]` against `[data-icon] svg` after load.
