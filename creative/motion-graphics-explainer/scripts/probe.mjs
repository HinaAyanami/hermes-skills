// Cheap real-time probe: open the page, wait, screenshot, report mounted elements.
// Run this BEFORE a full-length record so a missing asset or a dead timeline
// costs seconds instead of a two-minute encode.
//
// Usage: node probe.mjs <url> [waitSeconds] [outPng]
//   node probe.mjs file:///D:/work/clip/intro.html 8 probe.png
//
// Note: Edge's `--headless --virtual-time-budget --screenshot` is not a
// substitute — its virtual clock does not advance CSS transitions reliably and
// can return a blank frame for a page that renders fine.
import { chromium } from 'playwright';

const [url, waitS, out] = process.argv.slice(2);
if (!url) {
  console.error('usage: node probe.mjs <url> [waitSeconds] [outPng]');
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout((parseFloat(waitS) || 8) * 1000);

const info = await page.evaluate(() => ({
  ready: !!window.__sceneReady,
  activeScene: (document.querySelector('.scene.active') || {}).id || null,
  iconHolders: document.querySelectorAll('[data-icon]').length,
  iconMounted: document.querySelectorAll('[data-icon] svg').length,
}));
console.log('PROBE ' + JSON.stringify(info));

await page.screenshot({ path: out || 'probe.png' });
await browser.close();
console.log('DONE');
