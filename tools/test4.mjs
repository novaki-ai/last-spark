// Meta progression, reroll, revive, evo card, boss visuals.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// seed meta with shards
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.setItem('novaki_last_spark_meta_v1', JSON.stringify({ shards: 1000, items: {}, runs: 0, wins: 0, bestStage: 0, bestTime: 0, startWeapon: 'spark_toss' }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => window.NOVAKI_QA?.state().screen === 'menu', null, { timeout: 20000 });

// forge: buy vigor x2, reroll, revive
await page.click('#m-forge');
await sleep(300);
const buy = async (id) => {
  await page.evaluate((id) => {
    const btn = document.querySelector(`[data-id="${id}"]`);
    if (btn && !btn.disabled) btn.click();
  }, id);
  await sleep(120);
};
await buy('m_vigor'); await buy('m_vigor'); await buy('m_reroll'); await buy('m_revive');
const meta = await page.evaluate(() => JSON.parse(localStorage.getItem('novaki_last_spark_meta_v1')));
console.log('forge purchases:', JSON.stringify(meta.items), 'shards left:', meta.shards,
  meta.items.m_vigor === 2 && meta.items.m_reroll === 1 && meta.items.m_revive === 1 ? 'ok' : 'FAIL');
await page.screenshot({ path: 'shots/60-forge.png' });
await page.click('#f-back');

// start run: maxHp should be 124 (100 + 24)
await page.evaluate(() => window.NOVAKI_QA.start({ seed: 21 }));
await sleep(400);
let s = await page.evaluate(() => window.NOVAKI_QA.state());
console.log('maxHp with 2x vigor:', s.player.maxHp, s.player.maxHp === 124 ? 'ok' : 'FAIL');

// level up -> reroll button present
await page.evaluate(() => window.NOVAKI_QA.addXp(30));
await sleep(300);
s = await page.evaluate(() => window.NOVAKI_QA.state());
if (s.screen !== 'levelup') console.log('FAIL: no levelup');
const hasReroll = await page.$('#lv-reroll');
console.log('reroll button:', hasReroll ? 'ok' : 'FAIL');
const before = await page.evaluate(() => window.__ui.levelupOffers.map((o) => o.id).join(','));
await page.click('#lv-reroll');
await sleep(150);
const after = await page.evaluate(() => window.__ui.levelupOffers.map((o) => o.id).join(','));
console.log('reroll changed offers:', before !== after ? 'ok' : `(maybe same pool) ${before} -> ${after}`);
await page.screenshot({ path: 'shots/61-levelup-reroll.png' });

// force evo offer: max spark_toss + dry_wick via debug
await page.evaluate(() => {
  const g = window.__game;
  g.player.weapons.find((w) => w.id === 'spark_toss').level = 5;
  g.player.passives.push({ id: 'dry_wick', level: 1 });
  g.recalcStats();
  window.__ui.hooks.onChooseOffer; // noop
});
await page.evaluate(() => window.NOVAKI_QA.chooseUpgrade(0));
await sleep(150);
await page.evaluate(() => window.NOVAKI_QA.addXp(50));
await sleep(300);
const evoIdx = await page.evaluate(() => window.__ui.levelupOffers.findIndex((o) => o.evo));
console.log('evo offered:', evoIdx >= 0 ? 'ok' : 'FAIL');
await page.screenshot({ path: 'shots/62-evo-card.png' });
if (evoIdx >= 0) {
  await page.evaluate((i) => window.NOVAKI_QA.chooseUpgrade(i), evoIdx);
  await sleep(150);
  const ups = await page.evaluate(() => window.NOVAKI_QA.state().upgrades);
  console.log('evolved:', ups.includes('spark_toss_evo') ? 'ok' : 'FAIL ' + ups.join(','));
}

// revive test
await page.evaluate(() => { window.__game.player.hp = 3; });
await page.evaluate(() => window.NOVAKI_QA.spawnEnemies(60));
await sleep(4000);
s = await page.evaluate(() => window.NOVAKI_QA.state());
console.log('revive kept player alive:', s.player.hp > 0 ? `ok (hp=${s.player.hp})` : 'FAIL dead ' + s.player.hp);
await page.screenshot({ path: 'shots/63-revive.png' });

// boss 2 real-time visual
await page.evaluate(() => window.NOVAKI_QA.setInvincible(true));
await page.evaluate(() => window.NOVAKI_QA.skipTo(2, 'boss'));
await sleep(5200);
await page.screenshot({ path: 'shots/64-boss2.png' });
// boss 3 pattern
await page.evaluate(() => window.NOVAKI_QA.skipTo(3, 'boss'));
await sleep(5200);
await page.screenshot({ path: 'shots/65-boss3.png' });

console.log('console errors:', errors.length);
for (const e of errors.slice(0, 8)) console.log(' ', e.slice(0, 200));
await browser.close();
server.close();
console.log('DONE');
