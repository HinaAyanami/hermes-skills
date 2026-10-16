// 校验进化页渲染结果（尤其是静默期合并是否正确），无需浏览器。
// 用法: node verify-render.js "%EVOLUTION_LOG%/index.html"
// 原理: 抽出页面里的 <script>，在最小 DOM stub 下执行，打印时间线每张卡片的日期/标题/徽标。
const fs = require('fs');
const file = process.argv[2] || '%EVOLUTION_LOG%/index.html';
const src = fs.readFileSync(file, 'utf8');
const code = src.match(/<script>([\s\S]*?)<\/script>/)[1];

const els = {};
const mkEl = id => ({
  id, textContent: '', innerHTML: '', hidden: false, dataset: {},
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  addEventListener() {}, setAttribute() {}, getAttribute: () => null,
  querySelectorAll: () => [], closest: () => null,
});
global.document = { getElementById: id => els[id] || (els[id] = mkEl(id)), querySelectorAll: () => [] };
global.window = { scrollTo() {} };
global.location = { hash: '' };
global.history = { replaceState() {} };
global.performance = { now: () => 0 };
global.requestAnimationFrame = () => 0;
global.setTimeout = () => 0;

eval(code);

const html = els['timeline'].innerHTML;
const strip = s => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const days = (src.match(/date: "20/g) || []).length;
const cards = html.split(/<div class="day(?=[ "])/).slice(1).map(p => ({
  cls: p.slice(0, p.indexOf('"')).trim() || 'day',
  date: strip((p.match(/<span class="day-date">([\s\S]*?)<\/span>\s*<span class="day-title"/) || [, ''])[1]),
  title: strip((p.match(/<span class="day-title">([\s\S]*?)<\/span>/) || [, ''])[1]),
  pills: [...p.matchAll(/<span class="pill[^"]*">([\s\S]*?)<\/span>/g)].map(x => strip(x[1])),
}));

console.log(`数据 ${days} 天 → 时间线 ${cards.length} 张卡片`);
for (const c of cards) console.log(`${c.date.padEnd(20)} [${c.cls}] ${c.title}  ${c.pills.join(' / ')}`);
