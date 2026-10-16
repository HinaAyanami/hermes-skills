"""Template: headed QR login for a browser-automation backend, run detached.

Copy next to the task's artifacts, edit the constants, then run it from the agent as:

    PY="<hermes venv>/Scripts/python.exe"
    terminal(background=True, pty=True, notify=True, command=f'"{PY}" <path>/<this>.py')

Why detached + pty: a tool call cannot survive the flow's runtime, and the pty keeps any
`input()` prompt answerable from the chat via process(submit).

While the browser waits you can send the QR PNG to the user as `MEDIA:<path>` — the flow usually
writes it beside the session file and deletes it in its `finally`, so grab it early.
"""

import asyncio
import json
import sys
from pathlib import Path

LIBRARY = Path(r"C:\Users\<user>\.hermes\douyin\sau")   # the library's clone root
MODULE = "uploader.douyin_uploader.main"                 # module holding the login entry point
LOGIN_FN = "douyin_cookie_gen"                          # async login callable
SESSION_FILE = r"C:\Users\<user>\.hermes\douyin\cookies_default.json"


def main() -> None:
    sys.path.insert(0, str(LIBRARY))
    module = __import__(MODULE, fromlist=[LOGIN_FN])

    print("opening headed browser ...", flush=True)
    result = asyncio.run(
        getattr(module, LOGIN_FN)(
            SESSION_FILE,
            headless=False,        # required to scan a QR code
            poll_interval=3,       # default 2 x 60 = 2 minutes is too short for a human
            max_checks=200,        # -> ~10 minutes
        )
    )
    print("LOGIN RESULT: " + json.dumps(result, ensure_ascii=False, default=str), flush=True)


if __name__ == "__main__":
    main()
