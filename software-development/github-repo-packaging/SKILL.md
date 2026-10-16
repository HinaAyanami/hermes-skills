---
name: github-repo-packaging
description: Package local deliverables into a GitHub repo.
---

# 把本地产物打包成可上传的 GitHub 仓库

触发：用户问"这些产物有没有值得传到 GitHub 的"，或要求把某个本地交付物整理成仓库。
目标：交付物原目录不动，新建一个自包含、能在别人机器上跑起来、无隐私/版权风险的仓库。

## 1. 定范围（先扫再复制）

- 清点源目录，逐个判断"作品 / 工具 / 课程或他人产物 / 第三方代码"。
- 敏感信息扫描：`grep -l` 姓名、学号、学校、学院、专业、指导教师，覆盖 html/js/mjs/py/md/cs/ps1/ms/json。
  **二进制文档（.docx/.pptx/.xlsx）grep 扫不到** —— 必须用 `read_file` 提取文本单独检查，否则会把写着真实姓名学号的报告发出去。
- 排除：第三方目录（`node_modules/`、`.venv/`）、上游二进制备份、他人商标图标（如 `*.ico`）、教材案例衍生文件。
- 体积红线：GitHub 单文件硬限 100MB。排除 .venv、原始 wav/mp4 母带，>20MB 的文件逐个确认是否必要。

## 2. 复制 + 图片压缩

- 复制到统一位置（如 `<产物根>\_github\<repo-name>\`），只复制可发布的部分。
- 压缩截图时**保留原色彩模式**：`Image.open(p).convert('RGB')` 会把调色板/灰度 PNG 撑大 2-3 倍。
- 重编码后若比原文件大就回退原文件（`shutil.copy2`），不要硬塞优化结果。
- 1280px 截图 PNG optimize 收益有限（约降 25%），不值得为此转 JPEG 牺牲画面。

## 3. 脚本参数化（开源的关键一步）

本地脚本几乎必然带三类硬编码，逐个清掉：

| 硬编码 | 替成 |
|---|---|
| 浏览器路径 `C:/Program Files (x86)/.../msedge.exe` | 环境变量 `BROWSER_BIN` + 常见安装路径探测（含 mac/linux） |
| 产出绝对路径 `D:/<项目>/...` | 相对脚本自身：JS 用 `path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')`，Python 用 `Path(__file__).resolve().parent.parent` |
| 用户临时目录 `C:/Users/<name>/AppData/Local/Temp/...` | `os.tmpdir()` + 进程号 + 时间戳，避免并发冲突 |

- 多个脚本各抄一份 CDP/浏览器封装时，抽成共享模块（`tools/browser.mjs`），并让默认输出目录可被 CLI 参数覆盖。
- 失败要显式：无头截图拿不到页面诊断信号就给非零退出码，别静默产出一张 about:blank 的图。

**坑：`pathToFileURL()` 返回的已经是编码过的 URL，再套 `encodeURI()` 会双重编码 `%`→`%25`，页面根本不加载。** 症状是脚本"成功"了但诊断对象为 `{missing:true}`、`getElementById(...)` 返回 undefined。判断逻辑写成：带 scheme 的当完整 URL 直接用，否则才 `pathToFileURL`。

## 4. 必备元文件

- `LICENSE`（MIT，版权行用对外署名，不写真实姓名）
- `.gitattributes`：`* text=auto eol=lf` + `*.png binary` —— 否则 Windows 检出把脚本改成 CRLF
- `.gitignore`：验证临时产物目录（`out/`）、`node_modules/`、`__pycache__/`
- `package.json`（`type: module` + `engines.node` + scripts）/ `requirements.txt`
- `README.md` 英文为主 + `README.zh-CN.md`，双语互链；嵌 4-6 张关键图，不要贴满
- `index.html`（meta refresh 跳转）只为让 GitHub Pages 从根路径可用

## 5. 提交

```bash
git init -b main -q
git config --local user.name "<对外署名>"
git config --local user.email "<署名>@users.noreply.github.com"
git add -A && git -c core.quotepath=false commit -m "<主题：做了什么>"
```

- 只配 `--local`，不污染全局（本机可能没有全局 git 身份）。
- 邮箱用 GitHub noreply 格式占位，并告诉用户可以改。

## 6. 交付前验证（必须实跑，不能只写文档）

1. README 里每个 `![](path)` 与 `[x](path)` 都真实存在：
   `grep -oh '](\([^)]*\))' README*.md | sed 's/.*](//;s/)$//' | sort -u | while read -r p; do [ -e "$p" ] || echo "MISSING $p"; done`
2. 每个脚本在**仓库目录里**跑一遍，参数化后的路径解析才算被验证。较慢的脚本把输出重定向到 `out/`，别覆盖仓库里的展示图。
3. 渲染类产出用指标自检（亮度均值 / 亮像素占比 / 非全黑），不要靠"看起来没问题"。
4. 最后 `git status --short` 必须为空。

## 7. 推送 / 授权 / 绕过被阻断的 github.com

### 装 gh（免安装，最快）
从 `https://api.github.com/repos/cli/cli/releases/latest` 取 tag，下载 `gh_<ver>_windows_amd64.zip`（约 15MB），解压后把 `bin/gh.exe` 放进 PATH 里的目录即可 —— 不要走 msi（要 UAC）。

### 授权（device flow）
`gh auth login --hostname github.com --git-protocol https --web` **必须在 pty 后台里跑**（`terminal(background=True, pty=True)`），否则交互提示没人应答。
它会先问 `Authenticate Git with your GitHub credentials?`（`process_manage(action='submit', data='y')`），
再打印 8 位一次性代码（同时复制到剪贴板），然后等你按 Enter 打开浏览器。
把代码交给用户，让他去 `https://github.com/login/device` 输入并 Authorize —— 不要试图代他输账号密码/token。

### 关键事实：github.com 与 api.github.com 的封锁状态是分开的
本机对 `github.com:443` 是**间歇性阻断**（时通时断，同一分钟内可能 curl 超时 20s 而 `api.github.com` 返回 200/0.24s）。
先体检再选路：`curl -m 12 -o file -w '%{http_code}' https://api.github.com/rate_limit`（注意：MSYS 下 `-o /dev/null` 会报 `client returned ERROR on write`，别用它测速，写真实文件）。
`git push` 失败（`Failed to connect to github.com port 443`）时**不要反复重试**，直接改用下面这条 API 通道。

### 用 Git Data API 推送（等价于 git push，只走 api.github.com）
复用脚本：`%ARTIFACTS%\_github\_push_via_api.py`（改 OWNER / REPO / REPO_DIR 即可，token 由 `gh auth token` 取，绝不打印）。步骤与坑：

1. 每个文件 `POST /repos/{o}/{r}/git/blobs`（base64，4 线程并发；8MB/56 文件约 20-30s）。
2. **空仓库不能直接用 Git Data API**（`409 Git Repository is empty`）：先用 Contents API `PUT /contents/<file>` 落一个文件激活仓库。
   **必须是 PUT —— 默认发 POST 会得到 404 Not Found。**
3. **tree 不接受内联的嵌套结构**（`422 Unprocessable Entity`）：子目录要先递归 `POST /git/trees` 建成子树，
   再在父级以 `{path, mode:'040000', type:'tree', sha}` 引用，自底向上组装。
4. `POST /git/commits`（parents 指向初始提交，author/committer 用 `<login>@users.noreply.github.com`）
   → `PATCH /git/refs/heads/<branch>`（force）指过去。
5. 收尾用 `gh api` 核对远端：`/git/trees/<branch>?recursive=1` 数 blob 个数是否等于 `git ls-files | wc -l`，
   再看 `/commits`。打标签：`gh api -X PUT /repos/.../topics -f 'names[]=xxx'`。

### 其它
- git 2.54 在本机没配 credential helper 时，`git push`/`gh repo create --push` 会弹出 `CredentialHelperSelector` GUI 窗口（`<no helper>` / `wincred` / `manager`）挡在屏幕上 —— 走 API 路线时让用户直接点 Cancel。
- 走 API 推送后**本地仓库与远端历史不一致**：以后要用 `git push` 必须先 `git fetch && git reset --hard origin/main`。
- 用户完全不懂 GitHub 时，别一上来就讲命令行：说清"注册账号 → 建空仓库 → 把本地推上去"三步，并默认把仓库设为 public。
