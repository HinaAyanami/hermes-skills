---
name: a1111-webui-install-cn
description: Install A1111 stable-diffusion-webui on Windows/CN net.
---

# Installing AUTOMATIC1111 stable-diffusion-webui (Windows + CN network)

A1111 v1.10.1 (commit `82a973c0`) is effectively the last release, and several URLs it
hardcodes are now dead. Every rule below exists because the naive path fails.

## Order of operations
1. **Recon**: `git --version`, `nvidia-smi`, free disk, locate the model `.safetensors`.
2. **Find a working proxy BEFORE cloning** (see rule 1).
3. Install Python 3.10 with `uv python install 3.10`, then create the venv yourself.
4. Vendor every large/blocked artifact with `curl` first, then point pip/git at local files.
5. Install with `--exit` so `launch.py` returns, then restart normally and verify via API.

## Rules (each one cost a failure)

1. **Never assume GitHub is reachable — probe first.**
   `curl github.com` timing out while `curl baidu.com` returns 200 = TLS blocked, not a
   local fault. Look for an already-running client before asking the user:
   `tasklist | grep -i -E "clash|v2ray|xray|mihomo|sing"` and
   `netstat -ano | grep LISTENING | grep -E "7890|7891|7892|10809|1080"`.
   Set `HTTP_PROXY`/`HTTPS_PROXY` (git honours these); do NOT edit global git config.

2. **PyPI's Windows torch wheel is CPU-only.** PyPI and every CN PyPI mirror ship
   `torch-2.1.2-cp310-...win_amd64.whl` which installs as `torch 2.1.2+cpu` with
   `torch.version.cuda is None`. The CUDA build exists only under
   `https://download.pytorch.org/whl/cu121`. Always verify with:
   `python -c "import torch;print(torch.version.cuda, torch.cuda.is_available())"`.
   A ~1.1 GB `site-packages/torch` means CPU-only; CUDA is 3-4 GB.

3. **Download torch with curl, then install the local file.** `download.pytorch.org`
   answers a direct range request at 11-22 MB/s, but pip gets 302'd to
   `download-r2.pytorch.org`, whose TLS is interfered with (`SSLEOFError`,
   `ssl-verification-failed`). Workaround that survives both:
   `curl -L -C - --retry 15 --retry-delay 3 --retry-all-errors -o torch.whl "<url>"`
   then `pip install ./torch.whl`. Third-party mirrors (aliyun, sjtu) were 20-40x slower
   or broken — do not reach for them first.

4. **`Stability-AI/stablediffusion` no longer exists on GitHub** (REST API returns 404).
   `launch.py` then fails with `Couldn't clone Stable Diffusion` and
   `fatal: could not read Username for 'https://github.com'`. The A1111 **dev branch**
   already carries the fix:
   `set STABLE_DIFFUSION_REPO=https://github.com/w-e-w/stablediffusion.git`
   That mirror contains the exact required commit `cf1d67a6fd5ea1aa600c4df58e5b47da45f6bdbf`.
   Diagnose any "couldn't clone" this way: `curl https://api.github.com/repos/<owner>/<repo>`.

5. **pip cannot reach github.com/codeload.github.com even when git can.** CLIP and
   open_clip are installed from GitHub archive zips and will fail with
   `ReadTimeoutError` / `SSLEOFError`. Vendor them with curl-via-proxy, then override:
   `set CLIP_PACKAGE=%WHEELS%/CLIP-<sha>.zip` and `set OPENCLIP_PACKAGE=%WHEELS%/open_clip-<sha>.zip`.

6. **pip 26's build isolation breaks old setup.py files.** CLIP/open_clip fail with
   `ModuleNotFoundError: No module named 'pkg_resources'` because the isolated build env
   pulls setuptools 81+ (which removed pkg_resources). Install those two with
   `pip install --no-build-isolation <zip>` after ensuring `setuptools<81` in the venv.

7. **8 GB VRAM + SDXL needs `--medvram-sdxl`.** Without it: ~20 s/step and
   `nvidia-smi` pinned at 7755/8188 MiB. With it: 1024x1024/20 steps ≈ 44 s.
   Also add `--opt-sdp-no-mem-attention`; A1111 otherwise falls back to the slow
   `Doggettx` implementation (check the `Applying attention optimization: ...` log line).

8. **Split traffic by purpose, and exclude the fast paths from the proxy.**
   git → proxy; pip → Tsinghua (`set INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple`);
   then `set NO_PROXY=download.pytorch.org,pypi.tuna.tsinghua.edu.cn,localhost,127.0.0.1`
   so pip bypasses the proxy and takes the direct fast route.

9. **`webui-user.bat` details that bite:**
   - Write it with CRLF line endings.
   - Point `set PYTHON=` at the uv 3.10 interpreter. `webui.bat` reuses an existing
     `venv\Scripts\Python.exe` instead of rebuilding it, so pre-creating the venv
     wins the version argument.
   - `--exit` in `COMMANDLINE_ARGS` makes `launch.py` install-and-return, which is how
     you confirm a stage cleanly.
   - `webui.bat` ends with `pause`; redirect stdin (`< /dev/null`) or background runs hang.

10. **Verification that actually proves it works:** add `--api`, then
    `POST /sdapi/v1/txt2img` and base64-decode `images[0]` to a PNG. Start with
    512x512/8 steps to prove the path, then 1024x1024/20 for real performance.
    `/sdapi/v1/options` returning 404 means `--api` is missing, not that it is broken.

11. **Stopping it:** the listener PID is
    `netstat -ano | grep LISTENING | grep 127.0.0.1:7860`. Kill with
    `cmd.exe /c "taskkill /PID <pid> /F"` — calling `taskkill` directly from bash
    mangles the `/PID` switch.

## Reference
`templates/webui-user.bat` is the working config produced by this procedure.
