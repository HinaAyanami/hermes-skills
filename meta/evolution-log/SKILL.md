---
name: evolution-log
description: Use when updating or viewing the daily evolution log.
---

# 进化记录维护

## 位置
- 展示页（单文件，数据内嵌）：`%EVOLUTION_LOG%\index.html`
- 无其他数据文件；每天更新 = 在该文件的 `EVOLUTION.days` 数组**头部插入**一个新日期对象。

## 数据结构
```js
const EVOLUTION = {
  meta: { title, initialSkills: 53, initialSkillList: [/* 53 个初始内置技能名，新增判定的基准 */], initialMemories: 0, updatedAt },
  days: [
    {
      date: "YYYY-MM-DD",
      title: "当天一句话标题",
      summary: "当天总结",
      skills: { added: [{name, note}], updated: [{name, note}] },
      memory: { added: [], updated: [], removed: [] },
      other: []
    }
  ]
};
```

## 更新流程
0. **先查漏，再写今天**：读 index.html 时顺手看 `days[0].date` —— 若不是昨天，或 `cron/executions.db` 里本 job 有 `status=unknown` / `running` 的残留执行（报错大意「Scheduler restarted after this execution's owner exited before a durable terminal state」），说明有日期没写成，必须先补：按 `skills/.curator_ledger.jsonl` 的 ts/actor/action/skill 定变化、按 `memories/*.md` 与全库 `SKILL.md` 的 mtime 定日期，把缺失日期逐日插入 day 对象（漏掉的那天有变化照实写、无变化写稳定日，并在 `other` 里点明是事后按证据补记），然后再写今天。缺一天页面就永远空一天，cron 静默失败不会自己补偿。
0b. **相邻日也要查漏（不只查缺日）**：21:00 那次写入发生在用户晚间会话之前，21:00 之后发生的变化当天是写不进去的。所以除了看 `days[0].date`，还要把 `days[1]`（昨天那条）声称的时间戳/计数与实际的 `skills/**/SKILL.md`、`memories/*.md` mtime、`.curator_ledger.jsonl`、`logs/agent.log` 对一遍；对不上就**就地更正那一条**（改 title/summary 与 skills/memory 数组，让计数正确），并在它的 `other` 末尾追加 `【<今天> 回填更正】` 若干条，写清漏了什么、证据在哪、以及原条目被更正的数字——原有的运行层观察保留不改写，只把它标成「截至当时」。第 0 步补的是空白日，这一步补的是「写早了的当天」。
0c. **记忆变化的取证套路**（`memories/*.md` 只留最后一次 mtime，看不出中间写过什么）：① `state.db` 的 `messages` 表里 `tool_name='memory'` 的结果回执带 `entry_count` 与用量字符数，可钉住「这次写之前有几条」；② 会话内后台复盘线程（bg-review）的 memory 调用**不会**落进 `messages` 表，但 `logs/agent.log` 有 `tool memory completed (…, N chars)`，行号即时刻；③ `state.db` 的 `system_prompts` 按内容哈希去重、没有时间戳，但每条都含注入的 MEMORY / USER PROFILE 全文（含条数与字符数），按 rowid 升序比对就能框出某条记忆首次出现的区间，再借里面的技能清单判年代（新技能名何时开始出现）。
1. 用 `read_file` 读 index.html，定位 `EVOLUTION.days = [` 数组开头。
2. 收集今天的变化：
   - skills：`skills_list` 与「meta.initialSkillList（53 个初始内置名单）+ 历史 days.skills.added 记录」对比；**只有两者之外的名字才算「新增」**。更新时用 `skill_view` 看 diff 要点。
   - memory：对比本会话 memory 工具的新增 / 替换 / 删除调用。
3. 用 `patch` 在数组头部插入今天的对象（不要重写整个文件，避免破坏渲染逻辑）。
4. 更新 `meta.updatedAt` 为今天日期。
5. 校验：重新 read 确认语法正确、`days[0].date` 等于今天；再跑本 skill 自带的 `scripts/verify-render.js`（在 `skills/meta/evolution-log/scripts/` 下，展示页所在目录没有 scripts/）确认渲染层分组正确：`node scripts/verify-render.js "%EVOLUTION_LOG%/index.html"`。
   - **不要用浏览器工具校验**：本机 Hermes 的 browser 后端是云端 browser-use，`file://` 本地路径在云端不存在，`new_tab` 会一直挂到超时（表现为「卡住」）。改用 node 抽 `<script>` + 最小 DOM stub，或直接在聊天里用 `::preview{file="..."}` 渲染。
6. 交付：回复里给 `MEDIA:%EVOLUTION_LOG%\index.html`。

## 要点
- 只记真实发生的变化；没有变化的类别留空数组，不要编造。
- 官方内置 skill 被 Hermes 更新重装/重写（文件时间戳变化）≠ 新增；判断以 initialSkillList + 历史 added 为准，两者之外的名字才算新增（2026-09-09 曾把内置重装误记为新增，教训）。
- 若当天完全无变化：仍插入一条 `稳定日 · 无变化` 条目（title/summary 如上，数组全空），保持每天连续但内容诚实。
- memory 计数口径：含 USER.md（条目里用 `［MEMORY.md］` / `［USER.md］` 标来源）；本页建立（09-08）之前就存在的两条 USER.md 偏好（思考过程用中文、渐进式信息披露）不计入，与 09-14 的说明一致。
- 判断某条旧记录是否该更正，用「可反证的计数」最快：例如 `tool memory completed` 回执里的 `entry_count`，或页面渲染脚本输出的每天 ＋N 数量。
- 若 `days[0].date` 已是今天，说明今天已记录过，不要再插入重复条目；若比昨天还早（漏记），先按流程第 0 步回填缺失日期再插今天——顺序与连续性优先，不要为了让「最新日期」好看而跳过空白日。
- 无变化的判定要靠证据，不要凭感觉：比对文件时间戳即可——全库 `skills/**/SKILL.md` 的最新 mtime、`memories/MEMORY.md`、`memories/USER.md`、`skills/.curator_ledger.jsonl` 与 `skills/.curator_state`；若最新时间戳都早于今天，就是稳定日（`other` 里再记运行层动作：gateway 启动、`.bundled_manifest`/`.usage.json` 刷新、缓存与更新检查等）。
- 用中国标准时间（UTC+8）确定「今天」。
- **改图表时的页面约定**：横轴日期标签一律走 `tickIndices()` + `tickMarks()` + `axisLabels()` 三个helper（在 `fmtAxis()` 之后），按标签估算宽度自动抽稀并锚定最新一天——天数是会一直涨的，任何恢复「逐点标注」的改法都会在 ~20 天后重新挤成一团；柱子槽宽 < 18px 时柱顶数值只留在 `<title>` 悬停提示里，不要压小字号硬塞。校验用本目录外的 node 脚本抽页面真实 SVG 量标签中心距（对比标签宽），不要靠肉眼。

## 自动化
- 每日 21:00（本地时间）有 cron 任务「每日进化记录更新」自动执行本流程（deliver=local，静默）。
- 会话中我主动做出 skill/memory 变化时，也按本流程当场更新，不必等 cron。
- note 写"改进了什么 / 为什么"，不写日期和流水账。
- 数组头部插入 = 最新日期在最上面，页面倒序展示。
- **静默期合并（页面渲染层自动完成，无需改数据）**：连续多天「无 skill / 无 memory 变化」的日子会在时间线上合并成一张「连续 N 天未进化」卡片（日期范围 + 静默天数 + 有备注天数，展开可逐日看备注）；单天的稳定日仍是独立卡片。判定只按 skills/memory 是否为空，`other` 里的备注不算进化。因此不要为了页面整洁而删减稳定日条目，顺序与连续性必须保持。