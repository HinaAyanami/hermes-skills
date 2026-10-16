---
name: hermes-plugin-install
description: "Use when installing a third-party Hermes plugin."
version: 1.0.0
license: MIT
platforms: [windows, linux, macos]
metadata:
  hermes:
    tags: [hermes, plugins, windows, install, venv, gateway, desktop]
---

# Installing and verifying a third-party Hermes plugin

Companion to `hermes-agent`. Use for "install this plugin repo from GitHub" tasks.

## Install flow that works

1. Clone into the scanned directory: `$HERMES_HOME/plugins/<name>` — on Windows that is
   `%LOCALAPPDATA%\hermes\plugins\<name>` (resolve `$LOCALAPPDATA/hermes`; `~/.hermes` is a
   different directory on Windows). Or `hermes plugins install <owner/repo|git-url>`.
2. `hermes plugins enable <name>` — plugins are opt-in via `plugins.enabled` in config.yaml.
   Never hand-edit config.yaml. Do not grant `--allow-tool-override` unless asked.
3. `hermes plugins doctor <name>` — expect `OK: ... registrations: N tool(s)`.
4. Restart whichever process serves the session (see Activation).

## Python dependencies go into the Hermes venv

Plugin code imports inside Hermes, so install with the venv interpreter:

```bash
PY="$LOCALAPPDATA/hermes/hermes-agent/venv/Scripts/python.exe"
"$PY" -m pip install <pkg>
```

- System-python or plain `uv pip` installs produce a plugin that imports for you and
  `ImportError`s inside Hermes.
- For a bundled backend repo, `pip install --no-deps -e <dir>` then install its runtime deps by
  hand — its pinned requirements otherwise downgrade packages Hermes itself uses (seen:
  `requests==2.32.3` vs Hermes' 2.33.0). Check afterwards with `"$PY" -m pip check`.
- Browser automation: the binary is separate — `patchright.exe install chromium` /
  `playwright install chromium`, hundreds of MiB; run it in the background with notify.
- `.hermes-runtime/python/...` is the venv's *base* interpreter and is nearly empty; do not
  install there.

## Honour the plugin's own path convention

Plugins that hardcode `Path.home()/'.hermes'/...` (instead of `get_hermes_home()`) mean
`C:\Users\<u>\.hermes\...` on Windows, NOT `HERMES_HOME`. Clone backends where the plugin looks.

## Activation: which process must restart

Plugins load once per process at startup, so a running process never sees a newly enabled
plugin, not even in a new session.

- Messaging gateway: `hermes gateway restart` (safe alongside a desktop session — separate process).
- **Desktop app**: its backend is the `hermes_cli.main --profile <p> ...` process spawned by
  `Hermes.exe`. Walk the parent chain of your own tool process
  (`powershell "Get-CimInstance Win32_Process"`) to identify it; restarting the gateway does NOT
  reload it. Tell the user to restart the app — killing the backend kills the live session.
- Confirm: `grep -i <plugin> ~/.hermes/logs/agent.log` should show `Plugin discovery complete:
  N found, M enabled` and no `check_fn ... returned False` warning.

## Third-party plugins lag their backends — verify the calls

`hermes plugins doctor` only proves registration. Reproduce the plugin's real call path **inside
Hermes' import context** before calling it done:

- **Name collisions.** A backend repo shipping top-level packages (`utils/`, `uploader/`) loses to
  Hermes' own modules already in `sys.modules` (`hermes-agent/utils.py`): the backend's
  `from utils.x import y` raises `'utils' is not a package`. Fix by stashing the colliding names,
  `importlib.import_module(<backend entry point>)` once, caching the module object, then restoring
  Hermes' modules — the backend's own imports are already bound to its module objects.
- **Sync vs async drift.** A plugin written against a sync API while the backend moved to
  `async def` returns coroutine objects: checks pass stale, uploads report success that never
  happened, plus "coroutine was never awaited". Fix with a `_run_async(coro)` shim (`asyncio.run`,
  worker thread when a loop is already running) instead of rewriting handlers.
- **Test the condition the tool actually runs under.** Calling the plugin from a bare interpreter
  with a clean `sys.path` proves nothing: run it with Hermes' own `utils` imported first.
- Exercise the real binary/network path once (launch the browser headless, load the target page).
- Save edits as a `.patch` file beside the install notes — `hermes plugins update` overwrites them.

## Driving a long, interactive job through the backend

When the plugin only wraps a backend CLI/library (uploaders, scrapers), you do not have to route through
the plugin tool — and for jobs that need human input you should not:

- **Run the backend's own entry point as a `terminal(background=True, pty=True)` process.** Tool calls
  block with a fixed timeout and cannot accept input mid-flight; a pty background process lets you poll
  its output, and answer prompts with `process_manage(action="submit")` (never `write` with a bare `\n`).
- **Read the backend's own log file for progress**, not just stdout: many projects ship a file logger
  (`logs/<platform>.log`). Grep it for the platform's success marker.
- **Prefer letting the user type secrets into the visible browser window.** Headed mode + a window the
  user can reach keeps SMS codes and passwords out of the transcript; a standalone verification helper
  that accepts a code from a file or stdin is the fallback. Never ask for a password in chat.
- **Verify the external effect independently** after the process exits, and never trust the exit path:
  reopen the destination account (headless browser + stored cookie) and read the item list back. A
  `process.kill` termination, a missing success log line, or a `main()` that returns `None` all look
  like failures while the real side effect already landed (and vice versa).
- Long background jobs can be reaped when the owning backend restarts — treat "process gone" as
  "unknown", then settle it with the read-back.
