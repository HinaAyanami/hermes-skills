---
name: adobe-animate-jsfl-automation
description: "Use when automating Adobe Animate via JSFL scripts."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [windows, macos]
metadata:
  hermes:
    tags: [adobe-animate, jsfl, desktop-automation, computer-use, svg]
    category: creative
    related_skills: [computer-use]
---

# Automating Adobe Animate with JSFL

Animate is a self-drawn (Qt) app: **cua-driver's AX capture returns 0 elements**, so there is
no element-index clicking. All driving is coordinate + keyboard via PowerShell SendInput,
and all content work is done by a JSFL script the user's own Animate runs.

## Execution channel (the hard part)

1. **Put the script in the Commands folder** — it appears in 命令/Commands immediately (the menu
   is rescanned every time it opens; no restart needed):
   `%LOCALAPPDATA%\Adobe\Animate <version>\<locale>\Configuration\Commands\<name>.jsfl`
   The menu label is the file name, sorted case-insensitively — `A_hermes_draw` sorts BEFORE
   `A0_hermes` (underscore ordering is not plain ASCII here).
2. **Click it with a PowerShell burst, never with two cua-driver calls.** A popup menu closes
   between tool calls, so `click(menu)` then `click(item)` always misses. In ONE PowerShell run:
   click the app, click the menu-bar item, sleep ~900 ms, click the menu entry (sleep 3.5 s after
   the last click — see dialog handling below).
3. **Menus, popups and modal dialogs are separate top-level windows and do NOT appear in
   `capture(app="Animate")` screenshots.** Their geometry must come from Win32
   (`GetWindowRect`, `EnumWindows`), not from the app screenshot. Use `mode="som"` — the AX
   layer does report menu items with native (physical-pixel) bounds.
4. **Coordinate spaces** (Windows, per-monitor DPI):
   - `computer_use coordinate=[x,y]` is in **screenshot pixels**; the driver converts
     `physical = (window_origin_logical + screenshot * client_logical/client_screenshot) * dpi_scale`.
   - PowerShell is DPI-unaware → it must use **logical** coords:
     `logical = screenshot * (client_logical_width / screenshot_width)`.
   - Get `client_logical` and origin with `GetWindowRect` + `ClientToScreen`.
5. **Modal dialogs block the JSFL script.** Dismiss them from the same PowerShell run: find the
   process window whose title has the expected marker (`EnumWindows` + `GetWindowText`, match on an
   ASCII substring such as `.svg` — non-ASCII matching is unreliable because PowerShell reads
   `-File` scripts as ANSI), then `SetForegroundWindow(hwnd)` + send ENTER. A plain global ENTER
   fails because the foreground window may be a different app.
   - The SVG import dialog offers 将所有路径导入同一图层和帧 / 将每条路径导入不同图层 (default) /
     将每条路径导入不同关键帧, plus 更改舞台大小以匹配图稿大小; 确定 is the default button.
6. **Log every step to disk from inside the JSFL** (`FLfile.write(uri, text)`) and call it before
   every blocking import. When the script wedges on a dialog, the log shows exactly where.
7. **Animate locks the .jsfl after use** — you cannot overwrite or delete it (`Device or resource
   busy`), and `write_file`'s temp+rename fails. Ship a NEW file name instead; clean the folder up
   at the end (once no longer held it deletes fine).

## JSFL API traps in Animate 2024

| Call | Reality |
|---|---|
| `doc.addNewPath()` / `path.addCurve` | **Gone.** The bezier drawing API no longer exists. |
| `doc.importFile(svgUri, false)` | Works, returns true — but pops a **modal** options dialog on every call. One SVG per import. |
| `el.scaleX = 74` | **Multiplier, not percent** (74x → a 15000 px instance that vanishes off-stage). Use `0.74`. |
| `doc.scaleSelection(x, y, corner)` | Scales about a non-registration anchor → the instance drifts. Avoid. |
| `el.x` / `el.y` | Position of the element's **registration point** (for an imported SVG symbol that is the SVG origin), not its visual bbox. |
| `doc.getSelectionRect()` | The reliable read: select the element, read `{left,top,right,bottom}` of the real bbox. Best way to place instances. |
| `fl.saveDocument(doc, uri)` | Returns `false` (no exception) when the target name exists / is locked, after a confirm dialog gets cancelled. Save under a fresh name. |
| `addNewText(rect, "3")` | Creates a text box **with white background + black border** — clear with `doc.setElementProperty("background", false)` / `("border", false)`. |
| `setElementTextAttr("fillColor", ...)` | Silently ineffective in some builds; the run ends up with the tool color. Verify visually. |

Confirmed working: `addNewOval({left,top,right,bottom})`, `addNewRectangle`, `addNewText`,
`setCustomFill/Stroke`, `library.addNewItem("graphic", name)`, `library.editItem(name)`,
`library.addItemToDocument({x,y}, name)`, `timeline.addNewLayer(name)`, `layers[i].name`,
`exitEditMode()`, `fl.createDocument("timeline")`, `doc.width/height/frameRate`.

## Recommended workflow for "draw this picture in Animate"

1. **Never freehand with the mouse.** Bezier curves can't be produced by coordinate drags.
   Generate shapes as **SVG** instead (Python + Catmull-Rom → cubic beziers gives smooth outlines).
2. **Preview before touching Animate** — render your SVG assembly with headless Edge:
   `msedge.exe --headless --disable-gpu --screenshot=out.png --window-size=W,H file:///.../preview.html`
   Composite the same layers/transforms in HTML to check the assembly, then iterate cheaply.
   Read the PNG back with `vision_analyze` and fix geometry before generating Animate content.
3. JSFL: `fl.createDocument("timeline")` → set size/fps → for each symbol `addNewItem`+`editItem`,
   add one layer per artwork layer, `importFile` one SVG each → `exitEditMode()` → place instances →
   `fl.saveDocument(doc, <fresh uri>)`.
4. **Place instances with `getSelectionRect()` feedback**, not by computing from `el.x`:
   ```javascript
   el.selected = true;
   var r = doc.getSelectionRect();
   el.x += (targetLeft - r.left);
   el.y += (targetTop - r.top);
   ```
   One pass is exact because translation is linear.
5. Verify the result by measuring the screenshot (PIL: find the white canvas rect, then the bbox of
   non-white pixels inside it) rather than trusting a vision description alone.

## Pitfalls

- Don't trust a vision caption for geometry; measure pixels. Vision reports "empty canvas" when
  artwork is actually off-stage at 74x.
- `getSelectionRect()` is the only trustworthy source for where an instance really is.
- `fl.closeDocument(d, false)` invalidates `d`: read `d.name` BEFORE closing. Reading it after the
  close returns a wrong document's name, so a close-loop log will name the wrong files even when
  the operation itself was correct — verify against the before/after document lists.
- Close stray untitled test documents only after the deliverable is saved and copied out.
