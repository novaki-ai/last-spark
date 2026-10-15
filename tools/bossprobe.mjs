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

const out = await page.evaluate(() => {
  const g = window.__game;
  window.NOVAKI_QA.start({ seed: 5 });
  // give a solid build
  window.NOVAKI_QA.addXp(800);
  for (let i = 0; i < 30 && g.levelupOpen; i++) window.NOVAKI_QA.chooseUpgrade(0);
  window.NOVAKI_QA.setInvincible(true);
  window.NOVAKI_QA.skipTo(1, 'boss');
  const rows = [];
  const boss = g.boss;
  rows.push({ t: 0, bossHp: Math.round(boss.hp), phase: boss.boss.phase, bx: Math.round(boss.x), by: Math.round(boss.y), dist: 0 });
  for (let s = 0; s < 12; s++) {
    for (let i = 0; i < 600; i++) {
      // stand still (invincible)
      g.update(1 / 60, 0, 0, false);
      if (g.levelupOpen) window.NOVAKI_QA.chooseUpgrade(0);
    }
    const d = g.boss ? Math.hypot(g.boss.x - g.player.x, g.boss.y - g.player.y) : -1;
    rows.push({
      t: (s + 1) * 10,
      bossHp: g.boss ? Math.round(g.boss.hp) : 'DEAD',
      phase: g.boss?.boss?.phase,
      dist: Math.round(d),
      projectiles: g.projectiles.length,
      enemies: g.enemies.length,
      dmgDealt: Math.round(g.stats.dmgDealt),
    });
    if (!g.boss) break;
  }
  return { rows, weapons: g.player.weapons.map((w) => `${w.id}:${w.level}${w.evolved ? 'E' : ''}`), passives: g.player.passives.map((p) => p.id + ':' + p.level) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
server.close();
