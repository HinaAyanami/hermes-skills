---
name: dcc-mcp-3dsmax-install
description: Install/verify dcc-mcp-3dsmax on 3ds Max.
---

# dcc-mcp-3dsmax 安装与验证

## 触发
为 3ds Max 安装/验证 DCC-MCP 适配器（`dcc-mcp-3dsmax`，PyPI 包 + 3ds Max 内嵌 MCP server，网关 `http://127.0.0.1:9765/mcp`）时使用。官方 runbook 是仓库 `install.md` + `skills/dcc-mcp-3dsmax-setup/SKILL.md`。

## 硬规则
1. **CLI 装进独立 venv**，不要装进 Hermes/项目 venv（会拉 core+server 约 40MB，并可能需要打补丁）。
2. **startup-dir 必须显式给出，且等于 3ds Max 实际加载的语言 profile**。自动探测偏好 ENU；中文界面机器用 CHS。装错位置的现象：hook 文件存在、但没有 `bootstrap-errors` 目录、9765 也不监听 —— 因为启动脚本根本没跑。
3. **换 startup-dir 前先 uninstall**。receipt 与 hook 身份绑定，换目录会 fail-closed（`receipt_target_mismatch`, exit 10）；uninstall 幂等且安全。
4. **不要为了绿色报告改第三方源码**。`verify` 的探针缺陷属上游 bug，改探针名只是自欺；用端到端 typed 工具调用证明可用性。
5. 内嵌解释器通常**没有 pip**，先 `"<host>\Python\python.exe" -m ensurepip --upgrade`。

## 步骤

### 1 侦查（3ds Max 是 Windows only）
```bash
# 主机位置（常在非 C 盘）+ 版本
powershell -NoProfile -Command "Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -EA SilentlyContinue | Where-Object { \$_.DisplayName -like '*3ds Max*' } | Select DisplayName,InstallLocation"
# 内嵌解释器（2022+ 是 <host>\Python\python.exe，2025 起可能有 3dsmaxpy.exe）
ls "<host>/Python/python.exe" "<host>/3dsmaxpy.exe"
```

### 2 用 3ds Max 自己问出 startup 目录（比猜 profile 可靠）
写纯 ASCII 的 .ms 到 `%TEMP%`，输出到 ASCII 路径：
```maxscript
( local f = createFile "C:\\Users\\<u>\\AppData\\Local\\Temp\\probe_paths.txt"
  format "userStartupScripts=%\n" (getDir #userStartupScripts) to:f
  format "userScripts=%\n" (getDir #userScripts) to:f
  close f
  ok )
```
```bash
"<host>/3dsmaxbatch.exe" "C:/Users/<u>/AppData/Local/Temp/probe_paths.ms" -v 0
```
对照 `%LOCALAPPDATA%\Autodesk\3dsMax\<ver> - 64bit\` 下的 `ENU` / `CHS` 目录确认语言 profile。

### 3 CLI 环境
```bash
mkdir -p "%ARTIFACTS%/dcc-mcp-3dsmax-install" && cd "$_"
uv venv .venv --python 3.11
uv pip install --python .venv/Scripts/python.exe dcc-mcp-3dsmax
```

### 4 绕过 core 的报告 schema 自相矛盾（见「已知上游缺陷」）
若 `--json` 一跑就 `ValueError: Install SOP report failed schema validation ... keyword=const instance=/schema_version`：
把 `.venv/Lib/site-packages/dcc_mcp_core/deployment/install_sop.py` 的 `INSTALL_SOP_SCHEMA_VERSION` 改成 `1`
（schema 侧 `schema_version.const=1` 且有 sha256 校验，只能动常量）。**重建 venv 后要重打。**

### 5 安装
```bash
./.venv/Scripts/dcc-mcp-3dsmax.exe install --json --dry-run \
  --dcc-path "D:\3ds Max\3ds Max 2024" --python "D:\3ds Max\3ds Max 2024\Python\python.exe" \
  --startup-dir "C:\Users\<u>\AppData\Local\Autodesk\3dsMax\2024 - 64bit\CHS\scripts\startup"
# 检查 next_steps 与 steps 全 planned/ok 后：
./.venv/Scripts/dcc-mcp-3dsmax.exe install --json --yes <同上参数>
```
事务 4 步（preflight/acquire/stage/commit）为 ok 即安装成功；结尾通常是 `status=requires_restart`, exit 50（主机在跑，探针等不到）。

### 6 重启主机 + 验证
- 关掉 GUI 3ds Max 再开（hook 只在启动时加载）。**不要动别的任务正在用的 `3dsmaxbatch` 实例。**
- 等 9765 监听：`netstat -ano | grep 9765`
```bash
./.venv/Scripts/dcc-mcp-3dsmax.exe status --json <同上参数> --receipt-path "C:\Users\<u>\.dcc-mcp\receipts\3dsmax.json"
./.venv/Scripts/dcc-mcp-3dsmax.exe verify --json <同上参数> --receipt-path ...
```

### 7 verify 拿不到绿灯时，用 MCP 端到端证明可用性
```bash
# 读实例注册视图（gateway 的 MCP 资源）
POST http://127.0.0.1:9765/mcp  initialize → 取 mcp-session-id → notifications/initialized
resources/read uri="gateway://instances"   # 看 status/dispatch.ready/host_pid/port
# list_skills → load_skill → 调用 typed tool（实例端口随机，从 instances 里取）
POST http://127.0.0.1:<instance_port>/mcp  tools/call {"name":"load_skill","arguments":{"skill_name":"3dsmax-modeling"}}
POST ... tools/call {"name":"3dsmax_modeling__create_sphere","arguments":{"radius":50,"name":"mcp_setup_smoke_sphere"}}
# 读回确认
POST ... tools/call {"name":"3dsmax_scene__list_scene_nodes"}
```
网关侧正式通路（用户实际会连 9765）：`search(kind="tool", query=..., dcc_type="3dsmax")` → `tool_slug` 形如 `3dsmax.<instance_short>.<backend_tool>` → `call({calls:[{tool_slug, arguments}]})`（批量 ≤25）。
gateway 只暴露 `search` / `describe` / `load_skill` / `call` 四个工具，不要期待 tools/list 铺开后端工具。

## 已知上游缺陷（adapter 0.2.13 + core 0.20.34，2026-09 实测）
1. **`verify` 的探针工具不存在** → `directly_usable` 永远 false。`install_cli.py` 写死 `probe_tool="3dsmax_diagnostics__ping"`，该名在全包只此一处出现；core 的 `dcc-diagnostics` 只注册 `dcc_diagnostics__{screenshot,audit_log,tool_metrics,process_status,error_report}`。表现为 `verify` → `failure_reason=timeout, failure_stage=readiness`。**与安装是否正确无关**，别为此瞎折腾环境。
2. **报告 schema 版本自相矛盾**：core 常量 `INSTALL_SOP_SCHEMA_VERSION=2` vs 打包 schema `const=1` → 所有 `--json` 命令直接抛 ValueError。修法见步骤 4。
3. gateway 的 `search(kind="skill")` 在无匹配词时返回 `total 0`，不代表 catalog 空；用实例端点的 `list_skills` 确认真实 skill 集合（本机 25 个）。

## 其他坑
- **不要把 shell 的 cwd 留在 site-packages 里**：后续 `uv pip install` 删不掉被占用的包目录（`os error 32`）。
- 产物与 receipt 分开记：receipt 在 `~/.dcc-mcp/receipts/3dsmax.json`（勿手删），日志在 `%LOCALAPPDATA%\dcc-mcp\log\`。
