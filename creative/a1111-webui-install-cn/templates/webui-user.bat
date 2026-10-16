@echo off



set PYTHON=%USERPROFILE%\AppData\Roaming\uv\python\cpython-3.10-windows-x86_64-none\python.exe

set GIT=

set VENV_DIR=

set COMMANDLINE_ARGS=--api --opt-sdp-no-mem-attention --medvram-sdxl



REM ==== Proxy: needed to reach github.com (Clash mixed port) ====

set HTTP_PROXY=http://127.0.0.1:7890

set HTTPS_PROXY=http://127.0.0.1:7890

set http_proxy=http://127.0.0.1:7890

set https_proxy=http://127.0.0.1:7890

REM pip / PyTorch CDN are FAST on a direct CN connection -> bypass the proxy for them

set NO_PROXY=download.pytorch.org,pypi.tuna.tsinghua.edu.cn,mirrors.aliyun.com,localhost,127.0.0.1



REM ==== pip: Tsinghua PyPI mirror ====

set INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple



REM ==== torch CUDA build. PyPI and its CN mirrors ship CPU-ONLY torch for Windows;

REM  the CUDA build only exists on download.pytorch.org/whl/cu121, which is also the

REM  fastest source from CN. Do NOT repoint this at a PyPI mirror. ====

set TORCH_COMMAND=pip install torch==2.1.2+cu121 torchvision==0.16.2+cu121 --index-url https://download.pytorch.org/whl/cu121 --extra-index-url https://pypi.tuna.tsinghua.edu.cn/simple



REM ==== CLIP / open_clip archives, pre-downloaded via proxy (pip cannot reach codeload.github.com) ====

set CLIP_PACKAGE=%WHEELS%/CLIP-d50d76daa670286dd6cacf3bcd80b5e4823fc8e1.zip

set OPENCLIP_PACKAGE=%WHEELS%/open_clip-bb6e834e9c70d9c27d0dc3ecedeebeaeb1ffad6b.zip



REM ==== Stability-AI/stablediffusion was REMOVED from GitHub. A1111 dev branch points

REM  at maintainer w-e-w's mirror; it carries the required commit cf1d67a6. ====

set STABLE_DIFFUSION_REPO=https://github.com/w-e-w/stablediffusion.git



call webui.bat

