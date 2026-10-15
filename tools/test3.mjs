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

const runOnce = () => page.evaluate(() => {
  const g = window.__game;
  window.NOVAKI_QA.start({ seed: 777 });
  for (let i = 0; i < 1800; i++) {
    g.update(1 / 60, 0.5, 0.2, i === 300);
    if (g.levelupOpen) window.NOVAKI_QA.chooseUpgrade(1);
  }
  const sig = g.enemies.slice(0, 12).map((e) => `${e.def.id}@${e.x.toFixed(1)},${e.y.toFixed(1)},hp${e.hp.toFixed(0)}`).join('|');
  return {
    sig,
    kills: g.stats.kills,
    enemies: g.enemies.length,
    playerHp: g.player.hp.toFixed(1),
    xp: g.player.xp.toFixed(1),
    level: g.player.level,
    time: g.time.toFixed(2),
    upgrades: window.NOVAKI_QA.state().upgrades.join(','),
  };
});

const a = await runOnce();
const b = await runOnce();
const same = JSON.stringify(a) === JSON.stringify(b);
console.log(same ? 'DETERMINISM OK' : 'DETERMINISM FAIL');
if (!same) { console.log('A:', JSON.stringify(a, null, 1)); console.log('B:', JSON.stringify(b, null, 1)); }
else console.log('30s sim:', JSON.stringify({ kills: a.kills, enemies: a.enemies, hp: a.playerHp, level: a.level, upgrades: a.upgrades }));
await browser.close();
server.close();
