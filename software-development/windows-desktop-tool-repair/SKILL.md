---
name: windows-desktop-tool-repair
description: "Use when a Windows launcher or small native tool breaks."
version: 1.0.0
platforms: [windows]
metadata:
  hermes:
    tags: [windows, launcher, native-tool, csharp, npx, triage, repair]
    related_skills: [systematic-debugging]
---

# Windows 桌面小工具 / 启动器的诊断与修复

小工具突然失效时：从源码找“失效的前提” → 对照探针拿硬证据 → 改 → 用自带 csc 重编 → 备份后部署 → 端到端验证。

## 何时用

- 本机某个桌面启动器、托盘小工具、包装脚本“启动失败”、“每次打开都像第一次”
- 需要改动并重新编译一个单文件 C# exe（本机没有 VS，用 Windows 自带的 csc）
- 一个本地工具依赖外部 CLI（node/npx/python 工具）拉起服务，突然不工作了

## 核心流程

### 1. 先找到源码，不要只对 exe 反推

- 从 exe 提字符串判技术栈：.NET 程序的字符串是 UTF-16LE，`grep -a` 抓不到，用 python 正则 `rb"(?:[\x20-\x7e]\x00){4,}"` 提取。看到类名/方法名就能判断它是干什么的。
- 源码可能在 exe 同目录、`%ARTIFACTS%\` 里，或**已经被删掉、只剩构建残留**。
- 只剩 `%TEMP%\<name>\.git\objects\pack\*.pack` 时，源码能完整恢复：见 `references/git-pack-source-recovery.md`。

### 2. 从源码里找“失效的前提”

这类工具失效极少是自身 bug，多半是**它依赖的外部世界变了**。逐个核对：

- 它用什么命令拉起服务？有没有依赖 PATH 解析、依赖某个写死的安装目录？
- 它怎么判断“服务已经在跑”？字符串匹配上游产物、还是 HTTP 状态、端口？
- 它怎么打开前端？URL 里有没有必须携带的凭据？
- **它失败时做什么？** 会不会 kill 掉本该保留的东西？

### 3. 用对照探针拿硬证据，不要推理

把旧的判定逻辑和新的判定逻辑**并排跑在同一份真实输入上**（真实 HTTP 响应、真实进程输出），输出 True/False 或 exit code。要达到两个标准：

- **复现**：旧逻辑复现用户报的错，一字不差
- **修复**：新逻辑给出期望结果

没有测试框架时，写一个 30 行 console 探针编译跑一下就够了 —— 骨架见 `templates/differential-probe.cs`。这比“我认为应该是”强得多，而且是能贴给用户看的证据。

### 4. 改 → 编译 → 部署

编译（Windows 自带 .NET Framework 编译器）：

```bash
cd "%ARTIFACTS%/<任务名>"
/c/Windows/Microsoft.NET/Framework64/v4.0.30319/csc.exe /nologo /target:winexe \
    /optimize+ /win32icon:<icon>.ico /out:<name>-fixed.exe <src>.cs
```

- **自带 csc 是 C# 5**：不能用字符串插值 `$""`、`nameof`、表达式体成员、null 条件运算符 `?.`。Lambda 和 `delegate(...)` 匿名方法可以。
- 部署前**先备份原 exe**（复制进产物目录并 md5 核对），原版命名如 `*.original-backup.exe`。
- exe 正在运行时无法覆盖（`Device or resource busy`）→ 先 `taskkill` 再复制。
- 源码可能有多个版本共存：产物目录同时留「桌面实际在跑的那份」和「源码重编译的那份」，命名区分清楚。

### 5. 端到端验证，不只跑探针

冷启动走一遍完整流程：服务真的起、浏览器真的打开且不是错误页、二次启动走快速路径也不报错。探针绿了不等于产品绿。

## 陷阱

### 经 PATH 调 `.cmd` 的 `%~dp0` 陷阱（代价最大的一条）

`Process.Start("npx.cmd", args)`（`UseShellExecute=false`）会让 CreateProcess 沿 PATH 找到脚本，但 cmd.exe 里 **`%~dp0` 会解析成当前工作目录**，脚本接着去找 `<cwd>\node_modules\...` → `MODULE_NOT_FOUND`。只在脚本被**绝对路径**调用时才正确。

- 把 `C:\Program Files\<tool>` 当唯一候选路径，在任何便携安装的机器上都会掉进这个坑。
- 正确做法：解析出工具的绝对路径再调；更好的是**直接用解释器 + 入口 js**：`node.exe "<nodeDir>\node_modules\npm\bin\npx-cli.js" <args>`，完全绕开 .cmd 层。
- 回退分支也要用绝对路径 + `cmd.exe /c "\"<abs path>\" <args>"`。

### 靠匹配上游产物里的魔法字符串做健康检查 = 定时炸弹

`if (resp.Contains("__SOME_BOOT_MARK__"))` 这类判定，上游一改产物就永久为假，而失败表现是“每次都像第一次安装”，很难联想到真正的死因。

- 优先用语义判据：HTTP 状态码、响应头、结构化输出。
- **上游加了凭据**：无凭据探测会拿到 401。此时“401 且响应证明是目标服务”必须算作“在跑”，否则整个启动逻辑死循环。

### “判定失败 → 重复拉起 → 超时 → 杀端口”的自毁模式

典型写法：*我觉得服务没跑 → 再拉一个 → 端口被占 → 等 600 秒 → 报失败 → 按端口 taskkill*。最后一步会把**本来正常运行的服务杀掉**，用户看到的就是“每次都失败”。

- 排查时先看失败路径上有没有“按端口 / 按名字兜底 kill”。
- 自检逻辑必须能区分“服务在跑，但不是这个进程启动的”。
- 改动时不要让失败路径拥有比成功路径更大的破坏力。

### 一次性凭据必须落盘

上游把入口改成 `http://host:port/?token=<每次进程随机>` 后，启动时打印的那行入口 URL 就是唯一可用的入口。

- 必须从进程输出里抓取并落盘（如 `%LOCALAPPDATA%\<tool>\last-url.txt`）。
- 否则“服务已经在跑”的第二次双击只能开裸地址 → 401 错误页（用户会描述成“又让我认证 / 又像首次打开”）。
- 读回时先验证凭据仍有效（带凭据请求期望 303/200），失效则回退 —— 凭据是进程级的，重启即变。

### 竞态：服务先绑定端口、后打印入口 URL

探测“端口已监听”和“抓得到入口 URL”之间有几十毫秒到几秒的窗口。在这个窗口里开浏览器 = 开到错误页。

- 判就绪时**以“抓到入口 URL”为主信号**，端口探测作为兜底。
- 走兜底时也要再等几秒拿凭据，不要立刻开浏览器。

## 交付规范

- 产物统一放 `%ARTIFACTS%\<任务名>\`，不放桌面；每个任务单独一个文件夹。
- 原版一定留备份，命名清楚。
- 报告顺序：**根因（按“独立故障”分组，一个工具一次坏在几处是很常见的）→ 实测证据 → 改动清单 → 验证结果 → 遗留项**。
- 有可复跑的对照测试就告诉用户文件在哪，它比结论文字更有说服力。

## 支持文件

- `references/git-pack-source-recovery.md` —— 从残留 .git pack 恢复丢失源码的完整命令序列。
- `templates/differential-probe.cs` —— 对照探针骨架（旧判定 vs 新判定并排跑）。
