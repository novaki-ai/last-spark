// Bot-driven balance test: simulates a full run at accelerated speed by stepping
// game.update directly with heuristic "decent player" input. Reports pacing stats.
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

await page.evaluate((seed) => window.NOVAKI_QA.start({ seed }), Number(process.argv[2] ?? 1234));

// Install bot inside the page
await page.evaluate(() => {
  const g = window.__game;
  const ui = window.__ui;
  window.__bot = { log: [], done: false };

  const pickUpgrade = () => {
    const offers = ui.levelupOffers;
    if (!offers || !offers.length) return;
    const p = g.player;
    let idx = offers.findIndex((o) => o.evo);
    if (idx < 0) idx = offers.findIndex((o) => o.kind === 'weapon' && o.tag.startsWith('Level'));
    if (idx < 0 && p.weapons.length < 3) idx = offers.findIndex((o) => o.tag === 'NEW WEAPON');
    if (idx < 0) idx = offers.findIndex((o) => o.id === 'sturdy_stick');
    if (idx < 0) idx = offers.findIndex((o) => o.kind === 'passive' && o.tag.startsWith('Level'));
    if (idx < 0) idx = offers.findIndex((o) => o.tag === 'NEW WEAPON');
    if (idx < 0) idx = 0;
    window.NOVAKI_QA.chooseUpgrade(idx);
  };

  window.__step = (gameSeconds) => {
    const dt = 1 / 60;
    for (let s = 0; s < gameSeconds; s++) {
      // decide input once per game-second
      const p = g.player;
      let tx = 0, ty = 0;
      if (p.alive) {
        for (const e of g.enemies) {
          const dx = p.x - e.x, dy = p.y - e.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 260 * 260 && d2 > 1) {
            const w = 1 / (d2 / 9000 + 20);
            tx += dx * w; ty += dy * w;
          }
        }
        // seek gems
        let gx = 0, gy = 0, found = false;
        let bd = Infinity;
        for (const pk of g.pickups) {
          const dx = pk.x - p.x, dy = pk.y - p.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bd) { bd = d2; gx = dx; gy = dy; found = true; }
        }
        if (found && bd < 520 * 520) {
          const d = Math.sqrt(bd) || 1;
          // seek gems harder when the coast is clear, cautiously when swarmed
          const threat = Math.min(3, g.enemies.length / 40);
          const w = 2.2 / (0.6 + threat);
          tx += (gx / d) * w; ty += (gy / d) * w;
        }
        // gentle orbit around boss
        if (g.boss && !g.boss.dead) {
          const dx = g.boss.x - p.x, dy = g.boss.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          const want = 230;
          tx += (dx / d) * (d > want ? 0.9 : -0.9);
          ty += (dy / d) * (d > want ? 0.9 : -0.9);
          tx += (-dy / d) * 0.5; ty += (dx / d) * 0.5;
        }
      }
      const len = Math.hypot(tx, ty);
      const mx = len > 0.01 ? tx / len : 0;
      const my = len > 0.01 ? ty / len : 0;
      // dash when crowded
      let dash = false;
      if (p.alive && p.dashCdT <= 0) {
        for (const e of g.enemies) {
          const dx = p.x - e.x, dy = p.y - e.y;
          if (dx * dx + dy * dy < 48 * 48) { dash = true; break; }
        }
      }
      for (let i = 0; i < 60; i++) {
        g.update(dt, mx, my, dash && i === 0);
        if (g.levelupOpen) pickUpgrade();
      }
      window.__bot.log.push({
        t: Math.round(g.time), stage: g.stage.id, st: Math.round(g.stageTime),
        hp: Math.round(p.hp), lvl: p.level, enemies: g.enemies.length,
        kills: g.stats.kills, boss: !!g.boss,
      });
      if (!g.running) { window.__bot.done = true; break; }
    }
    return window.NOVAKI_QA.state();
  };
});

// step in chunks, printing progress
let lastPrint = 0;
for (let chunk = 0; chunk < 400; chunk++) {
  const s = await page.evaluate(() => window.__step(10));
  const done = await page.evaluate(() => window.__bot.done);
  const ui = await page.evaluate(() => window.__ui.current);
  if (s.time - lastPrint >= 60 || done) {
    lastPrint = s.time;
    const L = await page.evaluate(() => window.__bot.log[window.__bot.log.length - 1]);
    console.log(`t=${L.t}s stage=${L.stage} st=${L.st} lvl=${L.lvl} hp=${L.hp} enemies=${L.enemies} kills=${L.kills} boss=${L.boss} screen=${ui}`);
  }
  if (done) break;
  // handle transitions: story screens block nothing in sim, but advance them
  if (ui === 'story') {
    await page.evaluate(() => window.__ui.hooks ? null : null);
    await page.evaluate(() => {
      const ui = window.__ui;
      ui.advanceStoryByKey(); ui.advanceStoryByKey(); ui.advanceStoryByKey();
    });
  }
}

const final = await page.evaluate(() => ({
  state: window.NOVAKI_QA.state(),
  stats: window.__game.stats,
  build: {
    weapons: window.__game.player.weapons.map((w) => `${w.id}:${w.level}${w.evolved ? 'E' : ''}`),
    passives: window.__game.player.passives.map((p) => `${p.id}:${p.level}`),
  },
  meta: JSON.parse(localStorage.getItem('novaki_last_spark_meta_v1') || '{}'),
}));
console.log('\n=== RESULT ===');
console.log('screen:', final.state.screen, '| time:', Math.round(final.stats.time) + 's', '| level:', final.state.player.level, '| kills:', final.stats.kills);
console.log('build:', final.build.weapons.join(' '), '|', final.build.passives.join(' '));
console.log('shards earned:', final.stats.shardsEarned, '| meta shards:', final.meta.shards);
await page.screenshot({ path: 'shots/botrun-end.png' });
await browser.close();
server.close();
