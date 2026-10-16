// Screenshot every scene at an absolute page time and report element bounds,
// so overflow / overlap / clipping is caught by measurement rather than by eye.
//
// usage: node scan_scenes.mjs <html-path> <out-dir> <t1,t2,...>
//   e.g. node scan_scenes.mjs ../intro.html ../scan 4,9,14,19,26,33,39,44,49,54,58.5
//
// Prints, per time: which scene was active, how many [data-icon] slots mounted,
// and any element whose rect leaves the 1920x1080 canvas.
// Playwright resolves from the project's node_modules; run it from there.
import { chromium } from 'playwright';
import fs from 'fs';

const [html, outDir, timesArg] = process.argv.slice(2);
if (!html || !outDir || !timesArg) {
  console.error('usage: node scan_scenes.mjs <html-path> <out-dir> <t1,t2,...>');
  process.exit(1);
}
const times = timesArg.split(',').map(Number);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const fileUrl = 'file:///' + html.replace(/^\/+/, '');
await page.goto(fileUrl, { waitUntil: 'load' });
const t0 = Date.now();

for (let i = 0; i < times.length; i++) {
  const wait = times[i] * 1000 - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);

  const report = await page.evaluate(() => {
    const VW = 1920, VH = 1080;
    const active = document.querySelector('.scene.active');
    const bad = [];
    if (active) {
      active.querySelectorAll('*').forEach(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.left < -2 || r.top < -2 || r.right > VW + 2 || r.bottom > VH + 2) {
          bad.push((el.className || el.tagName) + ' @' +
                   [r.left, r.top, r.right, r.bottom].map(Math.round).join(','));
        }
      });
    }
    const slots = document.querySelectorAll('[data-icon]').length;
    const mounted = document.querySelectorAll('[data-icon] svg').length;
    return { scene: active ? active.id : null, icons: mounted + '/' + slots, bad };
  });

  const name = outDir + '/sc' + String(i).padStart(2, '0') + '_' + times[i] + 's.png';
  await page.screenshot({ path: name });
  console.log(times[i] + 's  scene=' + report.scene + '  icons=' + report.icons +
              (report.bad.length ? '  OVERFLOW: ' + report.bad.join(' | ') : '  ok'));
}

await browser.close();
