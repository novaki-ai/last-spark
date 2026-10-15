// Mobile portrait check after HUD fix + first-minute gameplay shot.
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
const browser = await chromium.launch();

// mobile portrait
{
  const ctx = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.NOVAKI_QA?.state().screen === 'menu', null, { timeout: 20000 });
  await page.evaluate(() => window.NOVAKI_QA.start({ seed: 8 }));
  await sleep(2500);
  await page.screenshot({ path: 'shots/70-mobile-hud.png' });
  await page.evaluate(() => window.NOVAKI_QA.spawnEnemies(40));
  await sleep(1500);
  await page.screenshot({ path: 'shots/71-mobile-combat.png' });
  await ctx.close();
}

// desktop first minute
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.NOVAKI_QA?.state().screen === 'menu', null, { timeout: 20000 });
  await page.evaluate(() => window.NOVAKI_QA.start({ seed: 8 }));
  await sleep(2500);
  await page.screenshot({ path: 'shots/72-desktop-start.png' });
  // play a bit: walk down-right
  await page.keyboard.down('s'); await page.keyboard.down('d');
  await sleep(5000);
  await page.keyboard.up('s'); await page.keyboard.up('d');
  await sleep(4000);
  await page.screenshot({ path: 'shots/73-desktop-early.png' });
  await page.close();
}
await browser.close();
server.close();
console.log('DONE');
