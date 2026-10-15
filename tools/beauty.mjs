// Beauty shots: mid-game combat with evolved weapons, weather, chests.
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
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.NOVAKI_QA?.state().screen === 'menu', null, { timeout: 20000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// build a strong mid-game state, let it play in real time
await page.evaluate(() => window.NOVAKI_QA.start({ seed: 11 }));
await page.evaluate(() => window.NOVAKI_QA.addXp(3000));
for (let i = 0; i < 40; i++) {
  const s = await page.evaluate(() => window.NOVAKI_QA.state());
  if (s.screen !== 'levelup') break;
  await page.evaluate(() => {
    const ui = window.__ui;
    const offers = ui.levelupOffers;
    let idx = offers.findIndex((o) => o.evo);
    if (idx < 0) idx = offers.findIndex((o) => o.kind === 'weapon' && o.tag.startsWith('Level'));
    if (idx < 0) idx = 0;
    window.NOVAKI_QA.chooseUpgrade(idx);
  });
  await sleep(80);
}
const build = await page.evaluate(() => window.NOVAKI_QA.state().upgrades);
console.log('build:', build.join(', '));
await page.evaluate(() => window.NOVAKI_QA.setInvincible(true));
await page.evaluate(() => window.NOVAKI_QA.spawnEnemies(90));
await page.keyboard.down('a');
await sleep(1800);
await page.keyboard.up('a');
await page.screenshot({ path: 'shots/40-combat1.png' });
await sleep(1200);
await page.screenshot({ path: 'shots/41-combat2.png' });

// stage 3 rain
await page.evaluate(() => window.NOVAKI_QA.skipTo(3, 'start'));
await page.evaluate(() => window.NOVAKI_QA.spawnEnemies(60));
await sleep(2500);
await page.screenshot({ path: 'shots/42-storm.png' });

// stage 2 cellar
await page.evaluate(() => window.NOVAKI_QA.skipTo(2, 'start'));
await page.evaluate(() => window.NOVAKI_QA.spawnEnemies(50));
await sleep(2500);
await page.screenshot({ path: 'shots/43-cellar.png' });

// elite + chest
await page.evaluate(() => {
  const g = window.__game;
  const e = g.spawnEnemyAt('moss_beetle', g.player.x + 100, g.player.y, true);
  g.damageEnemy(e, 999999, false, { pure: true });
});
await sleep(600);
await page.screenshot({ path: 'shots/44-chest.png' });
await browser.close();
server.close();
console.log('DONE');
