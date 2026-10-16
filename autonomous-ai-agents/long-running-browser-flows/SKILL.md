---
name: long-running-browser-flows
description: "Use when driving long browser automation with human steps."
version: 1.0.0
license: MIT
platforms: [windows, linux, macos]
metadata:
  hermes:
    tags: [browser-automation, background-process, pty, login, verification, publishing]
---

# Driving long, human-in-the-loop browser flows

Use for browser automation that runs for minutes and may stop to ask a human — QR/2FA login, SMS
verification, publishing to a platform, anything with a CAPTCHA. Not for quick single-page work;
use the browser tools for that.

## Why a tool call is the wrong surface

A tool call has a timeout you cannot extend, cannot answer a mid-flow prompt, and shows nothing
while it runs. A three-minute publish that stops for an SMS code inside a tool call is a black box
that eventually dies.

## The pattern

1. **Standalone script.** `sys.path.insert` the library's clone root, import its entry point, keep
   every parameter inline at the top. Write it next to that task's artifacts so it survives the
   session and can be re-run after a failure.
2. **Launch detached with a pty:** `terminal(background=True, pty=True, notify=True)`. The pty is
   what keeps the library's `input()` prompt answerable via `process(submit)`; without it an
   interactive prompt either blocks forever or returns empty.
3. **Read progress from the library's own log file**, not from the script's stdout or exit code.
   Browser-automation backends usually install a loguru/stdlib sink at a fixed path; `grep`/read the
   tail of that file, or use `process(log)`. Success is the library's own success line plus a
   changed final URL — never "the process exited 0".
4. **Keep `headless=False`** for anything a human may have to rescue (slider, code, "confirm on
   your phone"). Tell the user which window to look for, because the agent chat is usually on top
   of it.
5. **Give the flow a human-sized deadline.** Libraries default to impatient waits (e.g. 2 minutes)
   that expire while the user finds their phone; check the wait parameters and pass a longer one
   rather than re-running the whole flow.

## Human steps

- **QR codes:** the library typically writes the QR image next to the session file and *deletes it
  in its own `finally`*. Grab it while the flow is still waiting and send it as a chat image
  (`MEDIA:`) so the user can scan off the screen even if the window is buried.
- **SMS / 2FA codes:** offer "type it into the browser window yourself" as the default option — the
  code never enters the transcript and never passes through you. Only accept a code in chat when
  the user explicitly asks you to handle it.
- **File-injection beats stdin** when the library watches a file (e.g. `<backend>/verify_code.txt`):
  a polling loop re-reads the file, whereas a stdin prompt is consumed once. And a non-tty stdin
  makes the in-library prompt a silent no-op — a flow that keeps cycling without error is usually
  waiting for exactly this file.

## Don't route it through a wrapping plugin

A Hermes plugin around the same library is convenient for one-shot calls, but it is the wrong
layer for a long interactive flow, and it is often wrong about its own backend:

- Tool handlers are dispatched with extra keyword arguments (`task_id`, ...); a handler written as
  `def _handle_x(args)` raises `TypeError: unexpected keyword argument 'task_id'` on every call.
- Plugins mis-read their backend's contract — a backend `main()` that returns `None` while the
  plugin tests `if result:` reports every genuine success as "upload returned false".
- The plugin's own check functions can be false negatives inside Hermes' process (module-name
  shadowing, missing runtime packages) while the backend imports fine in a clean interpreter.

Drive the library directly; fix (or at least mention) the plugin separately. Plugin install/verify
mechanics live in the `hermes-plugin-install` skill.

## Verify the artifact, not the exit code

After the flow reports success, confirm it out of band: re-run the library's own session check
(`cookie_auth`-style function), assert the key field exists in the saved state (e.g. a non-empty
`sessionid`), and confirm the resource is visible in the platform's own UI/URL. A cookie file that
merely exists proves nothing.

## Instances

- `references/social-auto-upload-douyin.md` — the social-auto-upload / Douyin instance: paths, QR
  and SMS mechanics, publish parameters, log location.
- `templates/headed_login.py` — starter script for a headed QR login, parameterised for copy+edit.
