# Icon sets, subject mapping, and subtitle defaults

## Sourcing open-source icons (Iconify)

    https://api.iconify.design/<prefix>/<name>.svg
    # ph/brain.svg   ph/device-mobile.svg   mdi/pickaxe.svg

- **Send a User-Agent.** Python's default `urllib` UA gets `HTTP 403 Forbidden`; `curl` succeeds because it sends its own UA. Use `headers={'User-Agent': 'Mozilla/5.0'}` or shell out to `curl`.
- **Verify a candidate exists before designing around it.** A miss returns `404` and the page then renders an invisible gap rather than an error. Known misses: `ph:fish-hook`, `tabler:fishing-hook`, `mdi:fishhook` — `mdi:fishing` (rod plus line) covers the fishing case.
- Sets worth using: **Phosphor** (`ph`, MIT) and **Material Design Icons** (`mdi`, Apache-2.0). Both are fill-based paths, so `fill="currentColor"` inherits the CSS colour and one accent restyles everything.
- `viewBox` is per set (`ph` = `0 0 256 256`, `mdi` = `0 0 24 24`). Read it from the SVG; never hardcode one.
- `scripts/download_icons.py` emits `icons.js` (`window.ICONS = {name:{vb,body}}`) so the page inlines from a local file and re-renders never touch the network.

Mounting pattern:

    <span class="ic" data-icon="brain"></span>
    // ...
    el.innerHTML = '<svg viewBox="'+ic.vb+'" fill="currentColor" width="100%" height="100%">'+ic.body+'</svg>';

Prove they all resolved by comparing `document.querySelectorAll('[data-icon] svg').length` against `[data-icon]` in a probe.

## Concept → subject mapping that read instantly

| Line | Central subject |
|---|---|
| 刷短视频 | phone frame with a real short-video UI: avatar, “关注” pill, colour content cards, heart/comment/share rail, sliding finger dot |
| 它在刷你 | an **eye** surfacing inside the phone, phone tinting red |
| 投喂 | a **person** with content blocks dropping onto them |
| 多巴胺 | a **brain**, pulsing, particles leaving it |
| 算法钓住你 | a **fishing rod plus line with a person hanging** below, whole rig swinging |
| 没有底 | a **spiral** pulling cards in |
| 被开采 | a **pickaxe** striking an ore block, sparks |
| 控制权 | a **padlock** straining |
| 关掉 | a **power symbol** being pressed, frame going dark |

## Motion vocabulary that stays cheap to render

All of these run on `transform` / `opacity` only, which matters under headless software rendering:

- a figure that slowly floats and tilts (breaks the “one static image” feel)
- a finger dot that swipes upward and fades on a loop
- content blocks falling onto a target, then fading out
- a core that pulses with concentric rings expanding out of it
- particles emitted from a source (chemistry leaving a brain, sparks off ore)
- a pendulum rig swinging from a top pivot
- cards spiralling into a centre and shrinking to nothing
- a tool striking on a loop with a matching spark burst
- a symbol that strains (lock) or gets pressed (power)

Use `backdrop-filter` only on small floating cards; never on full-frame layers.

## Subtitle defaults (CJK, 1080p)

- Face: `"Noto Sans SC"` → `"Source Han Sans SC"` → `"Microsoft YaHei UI"`.
- 40 px / weight 550 / line-height 1.55 / letter-spacing ≈0.012em / one line per beat / ≈132 px from the bottom.
- Idle colour `#e9eaf0` on `#07070a`; keyword cyan `#5ec8ff` or red `#ff5d6c`, each with a soft `text-shadow` glow.
- Emphasis ladder (most to least restrained): colour only → colour + scale → colour + scale + shake.
