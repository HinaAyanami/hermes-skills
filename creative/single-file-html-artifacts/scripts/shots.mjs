#!/usr/bin/env node
/**
 * 逐页截图一个单文件多视图 HTML（幻灯片 / 双视图），用于视觉验证。
 *
 *   node shots.mjs <html路径> <输出目录> [waitMs] [页数]
 *
 * 前提：页面暴露 `window.__deck = { go(i), count }`（见 SKILL.md「多页演示」）。
 * waitMs 要大于入场动画总时长，否则截到动画中间态（常见 2000–3000）。
 * 输出 screenshots/p01.png … 并打印页数、探针、页面报错；有异常时退出码非零。
 *
 * 需要 Node 18+（全局 fetch / WebSocket）与本机 Edge/Chrome。
 * 收尾自动删临时 profile；进程被杀时的残留目录见 SKILL.md「交付与归档」。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const [input, outdir, waitMs = '2600', countArg] = process.argv.slice(2);
if (!input || !outdir) { console.error('用法: node shots.mjs <html> <outdir> [waitMs] [页数]'); process.exit(2); }

const W = 1600, H = 900;
const exe = BROWSERS.find(p => { try { return fs.existsSync(p); } catch { return false; } });
if (!exe) { console.error('找不到 Edge/Chrome'); process.exit(2); }

// 中文/空格路径必须转成百分号编码的 file:// URL，否则导航失败。
const toUrl = s => {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  const abs = path.resolve(s).replace(/\\/g, '/');
  return encodeURI('file:///' + abs.replace(/^\/+/, ''));
};
const url = toUrl(input);

// 随机端口 + 唯一 profile：避免并发调用互撞与旧进程残留的锁冲突。
const PORT = 9700 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shots-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const proc = spawn(exe, [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile.replace(/\\/g, '/'),
  '--allow-file-access-from-files',
  `--window-size=${W},${H}`,
  'about:blank',
], { stdio: 'ignore' });

let ws, msgId = 0, done = false;
function cleanup() {
  if (done) return; done = true;
  try { proc.kill(); } catch {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}
process.on('exit', cleanup);

const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++msgId;
  const onMsg = ev => {
    const m = JSON.parse(ev.data);
    if (m.id === id) { ws.removeEventListener('message', onMsg); m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result); }
  };
  ws.addEventListener('message', onMsg);
  ws.send(JSON.stringify({ id, method, params }));
});
// 页面里的异常不抛，回传成对象：出图这件事不该被诊断拖垮。
const ev = async expr => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.exceptionDetails) return { __err: JSON.stringify(r.exceptionDetails).slice(0, 400) };
  return r.result?.value;
};

try {
  let connected = false;
  for (let i = 0; i < 80 && !connected; i++) {
    await sleep(400);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); connected = true; }
    } catch { /* 浏览器还没起来 */ }
  }
  if (!connected) throw new Error('CDP 连接超时（浏览器没起来？）');
  await new Promise(r => ws.addEventListener('open', r));
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url });
  await sleep(2200);

  const count = countArg ? parseInt(countArg, 10) : await ev('window.__deck ? __deck.count : 0');
  if (typeof count !== 'number' || !count) throw new Error('页面没有暴露 __deck：' + JSON.stringify(await ev('typeof window.__deck')));
  console.log('页数:', count);

  const pageErrs = await ev('JSON.stringify(window.__errs || [])');
  fs.mkdirSync(outdir, { recursive: true });

  for (let i = 0; i < count; i++) {
    const r = await ev(`window.__deck.go(${i}); true`);
    if (r && r.__err) console.log('go(' + i + ') 报错:', r.__err);
    await sleep(Number(waitMs));
    const shot = await cdp('Page.captureScreenshot', { format: 'png' });
    const out = path.join(outdir, `p${String(i + 1).padStart(2, '0')}.png`);
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log('SHOT:', out, fs.statSync(out).size, 'bytes');
  }

  // 探针：生成物是否含 NaN/undefined、SVG 是否画出来、是否恰好一页激活。
  const probe = await ev('JSON.stringify({nan: /NaN|undefined/.test(document.body.innerText), svgs: document.querySelectorAll("svg").length, views: document.querySelectorAll(".slide").length, active: document.querySelectorAll(".slide.active").length})');
  console.log('PROBE:', probe);
  console.log('ERRORS:', pageErrs);
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  cleanup();
  await sleep(300);
}
