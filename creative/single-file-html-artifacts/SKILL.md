---
name: single-file-html-artifacts
description: Use when building or editing single-file HTML artifacts.
---

# 单文件 HTML 工件（内嵌数据 + 内联 JS 渲染）

构建/维护「一个 .html 文件承载全部数据与渲染逻辑」的工件：仪表盘、进化日志、widget、图表页。文件双击即可本地打开（file://）、离线可用。

## 架构铁律
- 数据与渲染分离：数据放 `const DATA = {...}`，渲染放一个 IIFE。数据对象（含数组锚点）是外部自动化流程（cron / skill）用 `patch` 定位插入的位置——改 UI 时保持其结构不变，否则自动更新失效。
- 全部内嵌、零外部依赖：file:// 下跨文件 fetch 被 CORS 拦截，CDN 依赖在离线时失效。图表手绘 SVG，字体用系统栈。
- 「多页」用单文件双视图：多个 `<div id="view-…">` 用 `hidden` 属性切换 + `location.hash` 路由 + 返回按钮，而非拆多个文件。

## 常用交互模式
- 折叠展开：`.details { display:grid; grid-template-rows:0fr; transition:grid-template-rows .3s ease }`，展开态 `1fr`；内层 `.inner { overflow:hidden; min-height:0 }`。比 max-height 平滑、无需硬编码高度。
- 悬停简介：绝对定位 `top:100%` + `opacity/transform` 过渡的小卡片，`pointer-events:none`，触发元素加 `position:relative`。
- SVG 数据点/色块用 `<title>` 做原生悬停 tooltip（离线可用，零 JS）。

## 多页演示（幻灯片）
把「PPT」做成单文件 HTML 演示：双击放映、按 F 全屏、方向键翻页、离线可用。比 pptx 保真的地方在动效——pptx 导出只剩基础逐项出现。
- 舞台固定 1600×900，外层 `transform: scale(min(innerWidth/1600, innerHeight/900))` 适配任意窗口。固定坐标系让所有排版数值可预估，缩放只在 `fit()` 里做一次。
- 翻页 = 给 `.slide` 切换 `.active` 类（`display:none → flex`）。用 `display` 而非位移堆叠：`display` 变化会让 CSS `animation` 自动重放，整套入场动效零额外 JS；改用 `transition` 则从 `display:none` 进场时不会播。
- 入场错峰：元素标 `class="rv"` + `style="--i:n"`，`animation-delay:calc(var(--i)*85ms + 110ms)`。调顺序只改数字。
- 暴露 `window.__deck = { go(i), count, index }` 并支持 `#n` 直链——逐页截图与排练都靠它。
- **已定稿的演示就是做视频最省力的底稿**：设计已经完成，只需把「用户翻页」换成「时间轴自动推进」。加录制模式的作法——注入 `window.__TIMELINE__`（每页时长 + 每句时间点）、用 `requestAnimationFrame` 比对 `performance.now()` 切页、用 `deck` 上的 `.started` 类控制起播前的黑屏——完整管线（录屏/旁白/混流）见 `narrated-html-video`。字幕层做成开关（`BAND = 0` + `display:none` 即回到满屏），别删掉代码。
- `file://` 下 `history.replaceState` 抛 SecurityError（origin 为 null），同步 hash 必须 `try{}catch{}`；`location.hash = '#n'` 可用但会堆历史记录。
- 键盘（方向键 / 空格 / PageUp-Down / Home / End / F）、点击左右三分之一、触摸滑动都接上；操作提示并入 HUD 一行，别单独悬在角落，封面页把它连同 HUD 一起隐藏。

### 卡片页面填满高度
- 「内容贴顶、底部大片空白」的根因是列内子项只取自然高度。一处修法：`.body{align-items:stretch}` + `.col>.card{flex:1 1 auto}` + `.card{display:flex;flex-direction:column;justify-content:center}`。卡片分摊剩余高度、内容在卡内垂直居中，比逐页调 padding 稳，也顺带解决两栏底边不齐。
- 上下分区的页面（流程条 + 对比卡）用 `flex` 权值分配剩余高度，别写死高度；比例失衡时调权值（如 `0.9 : 1.4`）比改内边距快。
- 中文没有空格，浏览器按字符断行，关键短语会被拦腰截断（书名号内、专有名词、数值+单位、叠词）。逐个包 `<span style="white-space:nowrap">`；`word-break:keep-all` 对整段无空格中文会造成溢出，不能全局用。

## 手绘 SVG 图表（无库）
- 面积/折线用 `lineArea(values, labels, tips, color, gid)`，堆叠柱用 `stackedBars(series, labels, tips)`；`<svg viewBox>` + `width:100%` 自适应。
- 轴刻度用 `niceStep`（1/2/5×10^k）取整；累计计数图用 min-max 轴而非 0 基轴——否则基线大（如 skill 数 53）时增长线几乎水平、误导读者。
- 颜色硬编码 hex 与页面主题一致；内联 SVG 里 CSS var 有时不可靠，直接写 hex。
- 空/单点数据要稳：`niceAxis` 在 lo===hi 时 ±1 展开；`Math.log10` 入参必须 >0（跨度≥2 再除，否则 NaN）。

## 校验（改完内联 JS 必做）
1. 语法：抽取 `<script>` 内容 `node --check`。
   `node -e "const fs=require('fs');const s=fs.readFileSync('index.html','utf8');const m=s.match(/<script>([\s\S]*?)<\/script>/);fs.writeFileSync('t.js',m[1])" && node --check t.js`
2. 运行时：用最小 DOM 桩在 node 里 `eval` 真实脚本（`document.getElementById` 返回带 innerHTML/textContent 的对象，`window`/`location`/`history`/`setTimeout` 桩掉），断言生成物无 `NaN`、图表容器含 `<svg>`、统计数字正确。比只看语法可靠——能抓到 `Math.log10(0)`、空数据轴计算等运行时错误。

## 渲染类工件（WebGL / Canvas / GLSL）的验证
语法检查与 DOM 桩对 GL **完全无效**：着色器编译失败常常静默降级（画面照出，只是效果没了），DOM 桩里根本没有 gl 上下文。这类工件必须用真实浏览器渲染出图才算验证过。

1. **页面里内建探针**：`window.__diag`（`gl / err / frames / fps / w / h / steps / hdr / post`）与 `window.__state`（相机、开关、交互状态）。自动化读它们来断言；不要靠「文件生成了」或「没抛异常」推断渲染成功。
2. **无头浏览器出图**：`scripts/headless-shot.mjs <url> <out.png> [waitMs] [--dist=N] [--wheel[=N]] [--drag] [--steps=N]` 用 CDP 驱动本机 Edge/Chrome 打开 `file://` 页面、等待渲染、回读探针、截图，退出码非零即渲染失败。自带随机端口、临时 profile 自动清理、中文路径 URL 编码。原理与像素分析见 `references/webgl-headless-verification.md`。
3. **交互发真事件**：拖动/滚轮/键盘用 CDP `Input.dispatchMouseEvent` 派发，再读 `__state` 前后差值断言（拖 300px 大致对应 yaw 变化 1.5 rad）。别用截图前后对比——自动旋转/动画让画面本来就在变。
4. **客观指标 + 主观评估互补**：Python 按区域算 `detail`（相邻像素梯度均值）、`mean`、过曝占比，与 `vision_analyze` 交叉验证。只调参不量化会在「看着差不多」里空转。`vision_analyze` 会被提问措辞带偏（问「还有哪些不足」就列十条），而且对留白/密度极苛刻——设计性的呼吸留白会被稳定报成「偏空、像凑页」，反复追问就会无限迭代。判定锚在**可复核的缺陷**上：溢出、裁切、重叠、两栏底边不齐、关键短语断行；留白只在明显不成比例时改一次。
5. **软件渲染的 fps 不是真实性能**：无头 + SwiftShader 是纯 CPU 光栅化，跑 1–2 fps 属正常，不要据此下性能结论、更不要据此砍效果。性能兜底做成自适应：测帧时间 → 调内部渲染分辨率（下限约 0.45）+ 暴露步数/质量滑块。
6. **扫参数极值，不要只测默认视角**：用户可调的每个参数（相机距离、步数、开关）都要在两端极值各出一张图。只在极值处失效的 bug——拉远到上限后画面整个空掉——在默认视角下完全看不出来。这类「用户一用就撞上、只测默认值永远发现不了」的缺陷是渲染工件最常见的形态。一块跑完用一行统计判定：

   ```bash
   for d in 12 25 80; do node scripts/headless-shot.mjs page.html out_$d.png 12000 --dist=$d; done
   # 整图 mean < 0.01 即「画面空掉」（不是变暗而是消失）
   ```

GLSL 与光追场景的四个静默陷阱（`#version` 首行、`smoothstep` 边界反写、细特征欠采样、硬编码裁剪半径与相机范围脱钩）见 `references/webgl-headless-verification.md`。

## 多页 / 多视图工件的验证
单文件多视图（幻灯片、双视图）必须**逐视图出图**：溢出、裁切、两栏底边不齐只出现在后面的页里，只截首屏等于没验。
1. `scripts/shots.mjs <html> <outdir> [waitMs] [页数]` —— 驱动本机 Edge/Chrome，逐页调 `window.__deck.go(i)`、等动画播完再截图，收尾回读探针（`innerText` 是否含 `NaN`/`undefined`、`<svg>` 数、`.slide.active` 数）并打印页面报错。
2. 再出一张**联系表**整体审阅：`templates/contact-sheet.html` 用 CSS grid 把 `screenshots/p*.png` 铺成 4×3，再拿 `scripts/headless-shot.mjs` 截成 `预览总览.png`（`--w=1420 --h=830`）。零图像库依赖，比逐张丢给 `vision_analyze` 省一大截上下文；缩略图下小字不可读属正常，别据此改字号。
3. 逐页检查的问法落到可复核的缺陷上（溢出 / 裁切 / 重叠 / 底边不齐 / 断行），一次问 3–4 页。

## 交付与归档
- 产物统一收进 `%ARTIFACTS%\<任务名>\`（不散在桌面/家目录）：页面、`预览.png`、`README.md` 放根，过程文件按 `screenshots/`、`analysis/`、`tools/` 分子目录。README 写打开方式、交互、性能调参、实现要点。
- 交付前清掉自己产生的临时文件：无头浏览器 profile 目录按调用次数累积，单个 50 MB 级（`rm -rf "$TEMP"/headless-shot-* "$TEMP"/shots-*`）。
- 多页工件在聊天里给 `预览总览.png`（联系表）+ 单文件本体（`MEDIA:` 路径），单页截图留在 `screenshots/` 备用。
- 用户说「做个 PPT」而没指定格式时：先交 HTML 演示 + 联系表审阅，再问要不要 `.pptx`。导出 pptx 必须说明动效会大幅缩水，别静默交付缩水版。
- **先出「一帧预览」，再花「重产物」的钱**：只要后续环节成本远高于出一张图（实时录屏、逐帧渲染、导出转码），就先把合成后的观感在真实画布尺寸下出一张图给用户确认，再执行。画面级反馈（要不要字幕、铺满还是留边、标签位置）用户只在看到成品时才会说，而重跑一次的代价是分钟级。内容级修改则相反——便宜，不必提前封版。
- 署名：默认不写用户的真名、学校、专业（除非这次产物明确是学校作业）；用户给了 handle 就署 handle。这类信息会顺带渗进**举例内容**里（样例书名、配文里的专业名、演示用的假回答），换署名时全库搜一遍再改，别只改封面那一行。
- 迁移或改名后，`tools/` 里脚本的硬编码路径要同步改（中文路径必须 `encodeURI` 成合法 `file://` URL），并且**实际跑一次**确认工具链在新位置可用——只改不跑等于没改。