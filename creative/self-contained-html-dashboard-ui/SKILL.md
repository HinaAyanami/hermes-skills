---
name: self-contained-html-dashboard-ui
description: "Use when building/animating self-contained HTML dashboards."
---

# 自包含 HTML 展示页：图表、动画与验证

适用：给本地 file:// 页面（数据内嵌、无构建、零外部依赖）加 UI——统计卡、可视化图表、动效、多视图导航。用户在桌面/浏览器里直接打开 HTML 文件查看，风格要求与页面主题一致、字体大且清晰、离线可用。

## 架构决策
- 需要"子页面/详情页"导航时用**单文件双视图**，不要拆多文件：file:// 下跨文件 fetch 受 CORS 限制，多文件还得各自嵌一份数据、每次更新都要同步。做法：同页两个顶层 view div，`hidden` 属性互斥切换 + `location.hash = "#analytics"` 支持刷新恢复，退出用 `history.replaceState` 清 hash。切换时 `window.scrollTo(0,0)` 定位顶端；**不要**自动 scrollIntoView 到内容区块（用户反馈过"打开子页面定位不在顶端"）。
- 数据锚点纪律：若页面数据被自动化写入（cron/脚本靠 patch 在数据数组头部插入新条目），UI 迭代永远只动渲染层，不改数据对象形状和它在文件里的排版锚点（如 `days: [` 开头）；每次 UI 迭代后重新确认锚点原样存在。
- 页面内容全部由 JS 渲染时，CSS 默认隐藏入场元素（opacity:0）没有无-JS 回退风险，可以放心用入场动画。

## SVG 图表配方（纯 SVG 手绘：零库、离线、可跟主题）
- 生成函数返回 `<svg viewBox="0 0 820 300" width="100%" style="display:block">` 字符串；坐标轴刻度用 niceStep/niceAxis 取 1/2/5×10^k 整数刻度（`Math.floor/ceil` 后按步长外扩）。
- **累计数量曲线用 min 基轴**（刻度从数据下限起）：0 基轴会把 53→54 的成长压成贴近 0 的平线，看起来像"从 0 涨到 54"的假象。
- 文字清晰：SVG 文本 ≥13px，坐标标签用偏亮灰（如 #a6b3c1），数值/类别用主文字色。
- 柱/条生长：rect 加 `style="transform-box:fill-box;transform-origin:bottom;animation:growUp .55s cubic-bezier(.22,.61,.36,1) backwards"`（横向条改 `transform-origin:left` + growX keyframe），逐项错开 `animation-delay`。
- 折线描边绘制：polyline 加 `pathLength="1000"` + `stroke-dasharray:1000;stroke-dashoffset:1000`，keyframes drawLine 把 offset 动画到 0（`forwards` 保持画完状态；inline dashoffset:1000 是重播基线）。
- 数据点 popIn（scale+opacity）、面积底 softFade。keyframes 都写页面 <style>：growUp/growX/drawLine/popIn/softFade。
- 入场动画一律 `animation-fill-mode: backwards`：延迟期保持 from 态、播完释放 transform，不会压住元素的 hover transition。
- 折线/面积只适合少量系列；"构成占比"类数据用**横向条形图**（每类一行：色点+名称+圆角条+数值，只显示非零行），不要用堆叠柱——单根柱上多层小色块难读（用户明确否过）。

## 动画陷阱
- 折叠容器（`grid-template-rows:0fr` + overflow hidden）里的图表动画会在用户展开前就播完——元素仍在渲染树里照常跑动画，只是被裁掉。展开时用 JS 重播：
```js
function replayAnimations(root) {
  root.querySelectorAll("[data-anim]").forEach(el => {
    const anim = el.style.animation;
    el.style.animation = "none";
    void el.getBoundingClientRect();
    el.style.animation = anim;
  });
}
```
- `display:none` 祖先的子元素，在其祖先重新显示（hidden 翻转）时 CSS animation 自动从头播放——详情视图内的图表动画无需额外触发，每次进入自然重来。

## 启动/入场序列（用户认可的风格）
- 顶部 2px 渐变进度线：一个 keyframes 完成 scaleX 0→1 再 opacity→0（`forwards`）。
- 内容分块 stagger 淡入上浮：`.reveal { animation: riseIn .55s ease backwards; }` + 每块 inline `animation-delay`（header 0.08 → 卡片 0.18 起每张 +0.08 → 图例/工具条 → 时间线 0.64）。
- 统计数字滚动：卡片内数字初始渲染为 0 并带 `data-target`，启动后按各自 delay `setTimeout` → rAF ease-out cubic 800ms 滚到目标值。

## 浏览器less 验证（无 Chromium/截图工具时的标准流程）
1. 语法：`node -e` 提取 `<script>` 内容写临时文件（放工作目录，用完 `rm`），再 `node --check`。
2. 运行时：node 里建最小 DOM 桩后 `eval` 整段脚本——`document.getElementById` 返回缓存对象（innerHTML setter/textContent/addEventListener no-op/querySelectorAll 返 []/dataset/hidden/closest）、`document.querySelectorAll:()=>[]`、window.scrollTo/location/history/setTimeout 桩。断言：无异常、全量输出无 `NaN`、关键元素计数（SVG、data-anim、class）正确。
3. 同文件多处修改：放 execute_code 里**顺序**调 `hermes_tools.patch`——一个回合并发发多个 patch 工具调用到同一文件会互相踩踏；patch 模糊匹配失败时先 read_file 确认精确文本再改。

## 用户偏好（默认值）
- 先概述后展开（渐进披露）：默认只显示标题+概述+变化徽标，点击才展开细节；"详情"指的是**具体内容**（原文列表），不是只有图表。
- 图表永远配一个"主图"默认展开，其余收进"点击展开"区，不要一次铺开四张挤小字。
- 交互元素给出明确 affordance：可点击卡片有 hover 抬升+边框高亮+"查看详情"提示；悬停浮出文字简介用绝对方位 tooltip（top:100%）。
- 计数类指标（天/条数）适合概览卡；进详情页的入口留给"有内容可看"的项。
- 新增项（如新技能）要重点展示：高亮卡 + 徽章 + 名称 + 用途描述，描述里出现「效果」字样则自动拆出独立高亮的效果段（数据写入约定：note 写成「…。效果：…」）。