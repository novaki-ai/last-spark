// Real-time soak test: plays with real keyboard input + real UI clicks for N seconds,
// watching fps, console errors, and memory growth.
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
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.NOVAKI_QA?.state().screen === 'menu', null, { timeout: 20000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await page.click('#m-play'); // real flow incl. audio unlock
await sleep(300);
await page.click('#st-skip'); // skip intro
await sleep(600);

const DURATION = Number(process.argv[2] ?? 150); // seconds
const held = new Set();
const keys = ['w', 'a', 's', 'd'];
const t0 = Date.now();
let fpsSamples = 0, fpsSum = 0, lastFrame = 0;
page.on('framenavigated', () => {});
// fps meter via exposed rAF counter
await page.evaluate(() => {
  window.__fps = { frames: 0, t0: performance.now() };
  const loop = () => { window.__fps.frames++; requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});

while (Date.now() - t0 < DURATION * 1000) {
  const s = await page.evaluate(() => window.NOVAKI_QA.state());
  if (s.screen === 'levelup') {
    // click first card through the real UI
    const card = await page.$('.card');
    if (card) await card.click();
    await sleep(120);
    continue;
  }
  if (s.screen === 'gameover' || s.screen === 'victory' || s.screen === 'story') {
    console.log('terminal screen reached:', s.screen);
    break;
  }
  if (s.screen !== 'playing') { await sleep(300); continue; }
  // bot movement: kiting vector from page
  const mv = await page.evaluate(() => {
    const g = window.__game;
    const p = g.player;
    let tx = 0, ty = 0;
    for (const e of g.enemies) {
      const dx = p.x - e.x, dy = p.y - e.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 240 * 240 && d2 > 1) { tx += dx / d2 * 9000; ty += dy / d2 * 9000; }
    }
    let bd = Infinity, gx = 0, gy = 0;
    for (const pk of g.pickups) {
      const dx = pk.x - p.x, dy = pk.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; gx = dx; gy = dy; }
    }
    if (bd < 400 * 400) { const d = Math.sqrt(bd) || 1; tx += gx / d * 1.6; ty += gy / d * 1.6; }
    return { x: tx, y: ty };
  });
  const want = new Set();
  if (mv.x < -0.3) want.add('a');
  if (mv.x > 0.3) want.add('d');
  if (mv.y < -0.3) want.add('w');
  if (mv.y > 0.3) want.add('s');
  for (const k of keys) {
    if (want.has(k) && !held.has(k)) { await page.keyboard.down(k); held.add(k); }
    if (!want.has(k) && held.has(k)) { await page.keyboard.up(k); held.delete(k); }
  }
  await sleep(180);
}
for (const k of keys) if (held.has(k)) await page.keyboard.up(k);

const fps = await page.evaluate(() => {
  const f = window.__fps;
  return f.frames / ((performance.now() - f.t0) / 1000);
});
const mem = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : -1));
const s = await page.evaluate(() => window.NOVAKI_QA.state());
console.log(`soak done: screen=${s.screen} level=${s.player.level} kills=${await page.evaluate(() => window.__game.stats.kills)} fps=${fps.toFixed(1)} heapMB=${mem}`);
await page.screenshot({ path: 'shots/50-soak.png' });
console.log('console errors:', errors.length);
for (const e of errors.slice(0, 10)) console.log(' ', e.slice(0, 240));
await browser.close();
server.close();
console.log('DONE');
