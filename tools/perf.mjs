// Quick perf measurement: load dist, start run, spawn N enemies, measure fps + long frames.
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const DIST = path.resolve('dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.ogg': 'audio/ogg' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  let file = path.join(DIST, p);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.NOVAKI_QA?.state().screen === 'menu', null, { timeout: 20000 });

const N = Number(process.argv[2] ?? 350);
const LEVELS = process.argv[3] === '1';
await page.evaluate(() => window.NOVAKI_QA.start({ seed: 99 }));
await new Promise((r) => setTimeout(r, 400));
await page.evaluate(() => window.NOVAKI_QA.setInvincible(true));
if (LEVELS) {
  // simulate a mid-run build: many weapons firing
  await page.evaluate(() => window.NOVAKI_QA.addXp(4000));
  for (let i = 0; i < 40; i++) {
    const s = await page.evaluate(() => window.NOVAKI_QA.state());
    if (s.screen === 'levelup') await page.evaluate(() => window.NOVAKI_QA.chooseUpgrade(0));
    else break;
    await new Promise((r) => setTimeout(r, 60));
  }
}
await page.evaluate((n) => window.NOVAKI_QA.spawnEnemies(n), N);
await new Promise((r) => setTimeout(r, 300));
const result = await page.evaluate(() => new Promise((resolve) => {
  let frames = 0, worst = 0;
  let last = performance.now();
  const t0 = last;
  const loop = () => {
    const now = performance.now();
    worst = Math.max(worst, now - last);
    last = now;
    frames++;
    if (now - t0 < 5000) requestAnimationFrame(loop);
    else resolve({ fps: frames / ((now - t0) / 1000), worst: worst.toFixed(1) });
  };
  requestAnimationFrame(loop);
}));
const s = await page.evaluate(() => window.NOVAKI_QA.state());
const perf = await page.evaluate(() => {
  const p = window.__perf;
  return { updateMs: (p.update / p.frames).toFixed(2), renderMs: (p.render / p.frames).toFixed(2), frames: p.frames };
});
console.log(`fps=${result.fps.toFixed(1)} worstFrame=${result.worst}ms enemies=${s.enemies} upgrades=${s.upgrades.length} update=${perf.updateMs}ms render=${perf.renderMs}ms`);
await page.screenshot({ path: 'shots/perf.png' });
await browser.close();
server.close();
