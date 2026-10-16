#!/usr/bin/env node
/**
 * 用 CDP 驱动本机无头 Chromium 系浏览器渲染一个页面，回读诊断探针并截图。
 *
 *   node headless-shot.mjs <url或本地路径> <out.png> [waitMs] [options]
 *
 * options:
 *   --dist=N      截图前把 window.__state.tDist 设为 N（等相机平滑到位）→ 扫参数域专用
 *   --wheel[=N]   派发 N 格滚轮（默认 1；deltaY 为正 = 拉远/缩小），打印 dist 变化
 *   --drag        派发一次拖动，打印 yaw/pitch 变化
 *   --steps=N     设 window.__state.steps（画质/步数滑块）
 *   --w=1280 --h=760
 *
 * 前提：页面内建探针 window.__diag（至少 gl / err）与 window.__state（交互断言用，可选）。
 * 需要 Node 18+（全局 fetch / WebSocket）。浏览器路径不存在时编辑 BROWSERS，或设 BH_BROWSER。
 * 软件光栅化下 WebGL 能跑但很慢（1–2 fps 正常），不要据此判断真实性能。
 *
 * 退出码：0 正常；1 渲染失败（gl=false / err 非空 / 超时）；2 用法错。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BROWSERS = [
  process.env.BH_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/microsoft-edge',
].filter(Boolean);

const argv = process.argv.slice(2);
const flags = argv.filter(a => a.startsWith('--'));
const [input, out, waitMs = '12000'] = argv.filter(a => !a.startsWith('--'));
if (!input || !out) {
  console.error('用法: node headless-shot.mjs <url或本地路径> <out.png> [waitMs] [--dist=N] [--wheel[=N]] [--drag] [--steps=N] [--w=] [--h=]');
  process.exit(2);
}

const flagVal = (name, dflt = null) => {
  const hit = flags.find(a => a === '--' + name || a.startsWith('--' + name + '='));
  if (!hit) return dflt;
  const i = hit.indexOf('=');
  return i === -1 ? true : hit.slice(i + 1);
};
const W = parseInt(flagVal('w', '1280'), 10);
const H = parseInt(flagVal('h', '760'), 10);
const setDist = flagVal('dist') === null ? null : parseFloat(flagVal('dist'));
const setSteps = flagVal('steps') === null ? null : parseInt(flagVal('steps'), 10);
const wheelRaw = flagVal('wheel');
const wheelN = wheelRaw === null ? 0 : (wheelRaw === true ? 1 : parseInt(wheelRaw, 10));
const doDrag = flags.includes('--drag');

const exe = BROWSERS.find(p => { try { return fs.existsSync(p); } catch { return false; } });
if (!exe) { console.error('找不到 Chromium 系浏览器，请编辑 BROWSERS 或设 BH_BROWSER'); process.exit(2); }

// 本地路径（尤其含中文/空格的）必须转成百分号编码的 file:// URL，否则导航失败。
const toUrl = s => {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  const abs = path.resolve(s).replace(/\\/g, '/');
  return encodeURI('file:///' + abs.replace(/^\/+/, ''));
};
const url = toUrl(input);

// 随机端口 + 唯一 profile：避免并发调用互撞，以及旧进程残留导致端口/profile 锁冲突。
const PORT = 9333 + Math.floor(Math.random() * 400);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'headless-shot-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const proc = spawn(exe, [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--mute-audio',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile.replace(/\\/g, '/'),
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  `--window-size=${W},${H}`,
  'about:blank',
], { stdio: 'ignore' });

let ws, msgId = 0, done = false;
function cleanup() {
  if (done) return; done = true;
  try { proc.kill(); } catch { /* 已退出 */ }
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* 占用中，留给系统清理 */ }
}
process.on('exit', cleanup);

const cdp = (method, params = {}) => new Promise((res, rej) => {
  const id = ++msgId;
  const onMsg = ev => {
    const m = JSON.parse(ev.data);
    if (m.id === id) {
      ws.removeEventListener('message', onMsg);
      m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result);
    }
  };
  ws.addEventListener('message', onMsg);
  ws.send(JSON.stringify({ id, method, params }));
});
// 探针可能不存在（页面没写）——返回 null 而不是抛，否则出图这件事被诊断拖垮。
const ev = async expr => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.exceptionDetails) return null;
  return r.result?.value;
};

const SNAP = 'window.__state ? JSON.stringify({yaw:__state.yaw,pitch:__state.pitch,dist:__state.dist,' +
             'tYaw:__state.tYaw,tPitch:__state.tPitch,tDist:__state.tDist}) : null';

let failed = false;
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
  await cdp('Page.navigate', { url });
  await sleep(Number(waitMs));

  const diag = await ev('JSON.stringify(window.__diag ?? null)');
  const errText = await ev('JSON.stringify(document.querySelector("#err")?.textContent || "")');
  console.log('DIAG :', diag);
  console.log('ERR  :', errText);

  if (setDist !== null || wheelN > 0 || doDrag) {
    await ev('window.__state && (window.__state.auto = false)');   // 关自动动画，否则状态本来就在变
    await sleep(400);
  }
  if (setSteps !== null) { await ev(`window.__state && (window.__state.steps = ${setSteps})`); await sleep(1500); }

  if (setDist !== null) {
    const b = await ev('window.__state && +__state.dist.toFixed(2)');
    await ev(`window.__state && (window.__state.tDist = ${setDist})`);
    await sleep(3000);                         // 等相机平滑插值到位
    console.log('DIST :', JSON.stringify({ from: b, to: await ev('window.__state && +__state.dist.toFixed(2)') }));
  }

  if (wheelN > 0) {
    const b = await ev('window.__state && +__state.tDist.toFixed(2)');
    for (let i = 0; i < wheelN; i++) {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: W >> 1, y: H >> 1, deltaX: 0, deltaY: 120, buttons: 0 });
      await sleep(60);
    }
    await sleep(2000);
    console.log('WHEEL:', JSON.stringify({ from: b, to: await ev('window.__state && +__state.tDist.toFixed(2)') }));
  }

  if (doDrag) {
    const before = JSON.parse(await ev(SNAP));
    await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x: 520, y: 380, button: 'left', clickCount: 1, buttons: 1 });
    for (let i = 1; i <= 12; i++) {
      await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 520 + i * 25, y: 380 + i * 7, button: 'left', buttons: 1 });
      await sleep(30);
    }
    await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 820, y: 464, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(1500);
    const after = JSON.parse(await ev(SNAP));
    console.log('DRAG :', JSON.stringify({
      dYaw: +(after.tYaw - before.tYaw).toFixed(4),
      dPitch: +(after.tPitch - before.tPitch).toFixed(4),
    }));
  }

  await sleep(2000);                            // 让交互后的画面多出几帧再截
  console.log('STATE:', await ev(SNAP));
  const shot = await cdp('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
  console.log('SHOT :', out, fs.statSync(out).size, 'bytes');

  const d = diag ? JSON.parse(diag) : null;
  if (d && (d.gl === false || d.err)) failed = true;   // 页面自己说没渲染成功
} catch (e) {
  console.error('FAILED:', e.message);
  failed = true;
} finally {
  cleanup();
  await sleep(300);
  process.exit(failed ? 1 : 0);
}
