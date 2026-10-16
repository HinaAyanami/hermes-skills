# social-auto-upload + Douyin (the backend behind the hermes-douyin plugin)

Domain notes for driving this library directly. Values below are concrete so a future session can
act without re-deriving them.

## Layout

| Thing | Path |
|---|---|
| Library clone | `C:\Users\<u>\.hermes\douyin\sau` (the plugin hardcodes `Path.home()/'.hermes'`, not `HERMES_HOME`) |
| Module config | `sau/conf.py` — copy from `conf.example.py` if missing (`BASE_DIR`, `LOCAL_CHROME_HEADLESS`, ...) |
| Session state | `cookies_<account>.json` in `~/.hermes/douyin/` |
| Progress log | `sau/logs/douyin.log` (loguru, filtered per business module) |
| SMS code drop-box | `sau/verify_code.txt` |
| Browser binary | `patchright install chromium` — the launch passes `channel="chromium"`, so a system Chrome will not do |

## Login

- Entry point: `uploader.douyin_uploader.main.douyin_cookie_gen(account_file, qrcode_callback=None,
  poll_interval=2, max_checks=60, headless=..., cdp_url=None)` — the wait budget is
  `poll_interval * max_checks` (2 min by default, too short for a human); pass e.g.
  `poll_interval=3, max_checks=200` for ~10 minutes. `douyin_setup()` wraps it but does **not**
  forward those parameters, so call `douyin_cookie_gen` directly when you need a long window.
- `headless=False` is required for scanning.
- The QR image is written beside the session file as `<stem>_login_qrcode_<timestamp>.png`, then
  deleted in the flow's `finally` — copy/send it while the flow is waiting.
- Success: result dict `status="success"`, `current_url` under `creator.douyin.com/creator-micro/`,
  and a `sessionid` cookie in the saved state.

## Publishing

- Video: `DouYinVideo(title, file_path, tags, publish_date, account_file, ..., desc,
  publish_strategy, headless)`; `main()` is async and **returns `None`** — success is the log line
  plus landing on `creator-micro/content/manage`.
- Title limits: video 30 characters, image note **20** (the note validator raises beyond it); image
  notes take ≤35 images and ≤1000 characters of body text.
- `publish_date=0` means publish now; otherwise pass a `datetime` (the platform requires ≥2h lead).
- Tags are bare strings (`["AI", "人工智能"]`); the publisher adds `#`.
- The publisher auto-selects the 「内容由AI生成」 self-declaration — expected, not an error.
- The publish loop is `while True` with no attempt cap: it exits only on the success URL, so a long
  runtime is normal, not a hang.

## SMS verification during publish

The loop detects the 验证码 modal, clicks 「获取验证码」 once, then reads
`<BASE_DIR>/verify_code.txt` if it exists, else `input()` **only when `sys.stdin.isatty()`**.
Consequences:

- Non-tty stdin (plain background process) makes the prompt a silent no-op — the loop just keeps
  cycling every few seconds. That is the signal that a code is needed, not a crash.
- Either let the user type the code into the headed window (default; keeps it out of chat), or write
  the code into `sau/verify_code.txt` — the loop re-reads the file and deletes it after submitting.
