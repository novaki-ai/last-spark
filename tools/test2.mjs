// Tests: intro story via Play button, game over screen, determinism, mobile touch.
import { chromium, devices } from 'playwright';
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

// --- desktop: story + gameover + determinism ---
{
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.NOVAKI_QA?.state().screen === 'menu', null, { timeout: 20000 });

  // real Play button → intro story
  await page.click('#m-play');
  await sleep(600);
  let s = await page.evaluate(() => window.NOVAKI_QA.state());
  console.log('after Play:', s.screen === 'story' ? 'ok story' : 'FAIL ' + s.screen);
  await page.screenshot({ path: 'shots/20-intro1.png' });
  await page.mouse.click(640, 400); await sleep(400);
  await page.screenshot({ path: 'shots/21-intro2.png' });
  await page.mouse.click(640, 400); await sleep(400);
  await page.screenshot({ path: 'shots/22-intro3.png' });
  await page.mouse.click(640, 400); await sleep(600);
  for (let i = 0; i < 10; i++) {
    s = await page.evaluate(() => window.NOVAKI_QA.state());
    if (s.screen === 'levelup') { await page.evaluate(() => window.NOVAKI_QA.chooseUpgrade(0)); await sleep(120); } else break;
  }
  s = await page.evaluate(() => window.NOVAKI_QA.state());
  console.log('after intro:', s.screen === 'playing' ? 'ok playing' : 'FAIL ' + s.screen);

  // determinism: run A
  const snap = async () => (await page.evaluate(() => {
    const g = window.__game;
    return g.enemies.length + '|' + g.stats.kills + '|' + g.player.x.toFixed(1) + ',' + g.player.y.toFixed(1) + '|' + (g.enemies[3] ? g.enemies[3].x.toFixed(1) : 'x');
  }));
  await page.evaluate(() => window.NOVAKI_QA.start({ seed: 777 }));
  await sleep(3000);
  const a1 = await snap();
  await page.evaluate(() => window.NOVAKI_QA.start({ seed: 777 }));
  await sleep(3000);
  const a2 = await snap();
  console.log('determinism:', a1 === a2 ? 'ok identical' : `FAIL ${a1} vs ${a2}`);

  // game over: drop player into swarm without invincibility, wait
  await page.evaluate(() => {
    const g = window.__game;
    g.player.hp = 5;
    window.NOVAKI_QA.spawnEnemies(80);
  });
  for (let i = 0; i < 40; i++) {
    const st = await page.evaluate(() => window.NOVAKI_QA.state());
    if (st.screen === 'gameover') break;
    if (st.screen === 'levelup') await page.evaluate(() => window.NOVAKI_QA.chooseUpgrade(0));
    await sleep(500);
  }
  s = await page.evaluate(() => window.NOVAKI_QA.state());
  console.log('gameover screen:', s.screen === 'gameover' ? 'ok' : 'FAIL ' + s.screen);
  await sleep(400);
  await page.screenshot({ path: 'shots/23-gameover.png' });
  await page.click('#g-menu');
  await sleep(400);
  s = await page.evaluate(() => window.NOVAKI_QA.state());
  console.log('back to menu:', s.screen === 'menu' ? 'ok' : 'FAIL ' + s.screen);
  await browser.close();
}

// --- mobile: touch joystick + layout ---
{
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push('MOBILE: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('MOBILE PAGEERROR: ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.NOVAKI_QA?.state().screen === 'menu', null, { timeout: 20000 });
  await page.screenshot({ path: 'shots/30-mobile-menu.png' });
  await page.evaluate(() => window.NOVAKI_QA.start({ seed: 3 }));
  await sleep(500);
  for (let i = 0; i < 6; i++) {
    const st = await page.evaluate(() => window.NOVAKI_QA.state());
    if (st.screen === 'levelup') { await page.evaluate(() => window.NOVAKI_QA.chooseUpgrade(0)); await sleep(120); } else break;
  }
  // drag on left half = joystick
  const before = await page.evaluate(() => window.NOVAKI_QA.state().player.x);
  await page.touchscreen.tap(100, 500); // gesture
  const t = await page.evaluate(() => new Promise((resolve) => {
    const el = document.elementFromPoint(100, 500);
    const opts = { bubbles: true, touches: [new Touch({ identifier: 1, target: document.body, clientX: 100, clientY: 500 })] };
    document.body.dispatchEvent(new TouchEvent('touchstart', opts));
    setTimeout(() => {
      document.body.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [new Touch({ identifier: 1, target: document.body, clientX: 160, clientY: 500 })] }));
    }, 100);
    setTimeout(() => resolve(true), 250);
  }).catch(() => false));
  // fallback: synthetic via window events since we listen on window
  await page.evaluate(() => {
    const mk = (type, x, y) => {
      const touch = new Touch({ identifier: 7, target: document.body, clientX: x, clientY: y });
      const ev = new TouchEvent(type, { bubbles: true, cancelable: true, changedTouches: [touch], touches: type === 'touchend' ? [] : [touch] });
      window.dispatchEvent(ev);
    };
    mk('touchstart', 90, 480);
    for (let i = 8; i <= 70; i += 8) mk('touchmove', 90 + i, 480);
    window.__tend = () => mk('touchend', 160, 480);
  });
  await sleep(1600);
  // keep joystick held with periodic moves (input is polled per frame)
  await page.evaluate(() => {
    const mk = (type, x, y) => {
      const touch = new Touch({ identifier: 7, target: document.body, clientX: x, clientY: y });
      const ev = new TouchEvent(type, { bubbles: true, cancelable: true, changedTouches: [touch], touches: [touch] });
      window.dispatchEvent(ev);
    };
    mk('touchmove', 160, 480);
  });
  await sleep(800);
  const during = await page.evaluate(() => window.NOVAKI_QA.state().player.x);
  await page.evaluate(() => window.__tend());
  console.log('touch move:', during > before + 20 ? `ok moved ${before} -> ${during}` : `FAIL ${before} -> ${during}`);
  await page.screenshot({ path: 'shots/31-mobile-play.png' });
  await browser.close();
}

console.log('console errors:', errors.length);
for (const e of errors.slice(0, 10)) console.log(' ', e.slice(0, 240));
server.close();
console.log('DONE');
