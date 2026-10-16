# Hermes Skills · 自建技能集

> 14 个在真实项目里沉淀出来的 [Hermes Agent](https://hermes-agent.nousresearch.com/docs) 技能。
> 每个技能记录的不是"命令清单"，而是**为什么必须这么做**——每条规则背后都对应一次真实的失败。

**English** — 14 Hermes Agent skills distilled from real projects: producing narrated videos from HTML/CSS animation, installing an image-generation stack over a hostile network, keeping long browser automations alive across human steps (QR login, SMS codes), and packaging local deliverables into publishable repositories. Mostly Chinese, some English. Each skill records the reasoning and the traps, not just the commands.

---

## 技能是什么

一个 Hermes 技能 = 一个目录 + `SKILL.md`：

```
<category>/<skill-name>/
├── SKILL.md          # YAML frontmatter (name / description) + 正文
├── references/       # 需要时才加载的细节文档
├── scripts/          # 可复用的验证 / 处理脚本
└── templates/        # 直接可用的模板文件
```

`description` 只有一句话，是**路由信号**（Agent 靠它决定要不要加载这个技能）；正文才是操作规程，只在被加载时进入上下文。技能不是文档，是**给 Agent 看的操作手册**。

**安装**：把技能目录整个复制到 Hermes 的 skills 目录下即可，重启会话后被发现。

| 平台 | 目录 |
|---|---|
| Windows | `%LOCALAPPDATA%\hermes\skills\<category>\<skill-name>\` |
| macOS / Linux | `~/.hermes/skills/<category>/<skill-name>/` |

## 内容

### 创作（creative/）

| 技能 | 一句话 |
|---|---|
| `narrated-html-video` | HTML/CSS 动画 → Playwright 录屏 → TTS 旁白 → ffmpeg 混流：把网页动画变成带解说的成片 |
| `motion-graphics-explainer` | 动效图形怎么让人一眼看懂：判据是"观众一秒内能说出这一场的主体" |
| `animated-explainer-design` | 解释性动画的设计层：该出现什么、为什么动、怎样算讲清楚了 |
| `single-file-html-artifacts` | 单文件 HTML 工件（数据内嵌 + 内联渲染），含无头浏览器逐页验证脚本 |
| `self-contained-html-dashboard-ui` | 给 `file://` 页面加图表、统计卡、动效与多视图导航 |
| `adobe-animate-jsfl-automation` | 用 JSFL 脚本驱动 Adobe Animate（SVG 素材导入、逐帧操作） |
| `a1111-webui-install-cn` | 在 Windows + 国内网络下装 A1111 SD WebUI，含 CUDA torch 的正确来源与本地 wheel 复用 |

### Agent 行为（autonomous-ai-agents/）

| 技能 | 一句话 |
|---|---|
| `long-running-browser-flows` | 长流程浏览器自动化里怎么衔接**人工步骤**（扫码登录、短信验证码）并留下可核实的证据 |
| `hermes-plugin-install` | 装第三方 Hermes 插件的完整路径（venv、顶层包名遮蔽、gateway 与桌面端两个进程的重启差异） |
| `dcc-mcp-3dsmax-install` | 给 3ds Max 装 `dcc-mcp` 适配器并验证 MCP 网关 |

### 工程（software-development/）

| 技能 | 一句话 |
|---|---|
| `github-repo-packaging` | 把本地产物整理成可公开的仓库：隐私扫描、脚本参数化、元文件、提交前实跑验证 |
| `github-publishing` | 把本地仓库推上 GitHub：先实测再选路线、凭据红线、被阻断时改走 API 通道 |
| `windows-desktop-tool-repair` | Windows 启动器 / 小工具坏了的系统化排查（含差分探针、源码替换重编译） |

### 元（meta/）

| 技能 | 一句话 |
|---|---|
| `evolution-log` | 维护一份"每日进化记录"页面：怎么取证、怎么写漏掉的日期、怎么校验渲染 |

## 这四个技能组共同的写法

- **规则后面写理由**。"先拉 2MB 测速再承诺 ETA"比"注意下载速度"有用，因为前者能让人在新情况下自己判断。
- **失败模式优先于成功路径**。比如 `a1111-webui-install-cn` 开头就写"A1111 v1.10.1 硬编码的若干 URL 已经死了，所以下面每条规则都是因为直路走不通"。
- **写明验证方式**。技能里反复出现"怎么确认真的做成了"——远端文件数对不对得上、渲染出来是不是黑帧、上传是不是真的在作品列表里。
- **对用户可见的行为也写成规则**。例如"下载/安装类操作先报实测 ETA"、"用户不懂 Git 时先给概念再给步骤"。

## 占位符约定

技能里出现的占位符，按你自己的环境替换：

| 占位符 | 含义 |
|---|---|
| `%LOCALAPPDATA%` | Hermes 数据目录（Windows）。macOS/Linux 上对应 `~/.hermes` |
| `%USERPROFILE%` | 用户主目录 |
| `%ARTIFACTS%` | 存放任务产物的目录（原作者的约定：每个任务一个子文件夹） |
| `%EVOLUTION_LOG%` | 进化记录展示页所在目录 |
| `%WHEELS%` | 本地预下载的 Python wheel 目录（离线安装 CUDA 版 torch 用） |

技能里出现的第三方工具、镜像地址、国内网络绕行办法，都是**当时实测有效**的记录；网络环境会变，照抄前先自己测一次。

## 许可

MIT，见 [LICENSE](LICENSE)。© HinaAyanami
