// Smoke + QA interface test. Serves dist/, drives the game, screenshots, checks console errors.
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const DIST = path.resolve('dist');
const SHOTS = path.resolve('shots');
fs.mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.ogg': 'audio/ogg', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(DIST, p);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('nope'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const BASE = `http://127.0.0.1:${port}/sub/path/`; // sub-path on purpose
server.removeAllListeners('request');
server.on('request', (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.startsWith('/sub/path')) p = p.slice('/sub/path'.length) || '/';
  if (p.endsWith('/')) p += 'index.html';
  let file = path.join(DIST, p);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    if (!p.startsWith('/assets/')) file = path.join(DIST, 'index.html');
    else { res.writeHead(404); res.end('nf'); return; }
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

const shot = (n) => page.screenshot({ path: path.join(SHOTS, n + '.png') });
const state = () => page.evaluate(() => window.NOVAKI_QA.state());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => { console.error('FAIL:', msg); process.exitCode = 1; };
const ok = (msg) => console.log('ok:', msg);

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.NOVAKI_QA && window.NOVAKI_QA.state().screen === 'menu', null, { timeout: 20000 }).catch(() => fail('menu never appeared'));
ok('menu shown');
await shot('01-menu');

// menu screens
await page.click('#m-howto'); await sleep(300); await shot('02-howto');
await page.click('#h-back'); await sleep(150);
await page.click('#m-forge'); await sleep(300); await shot('03-forge');
await page.click('#f-back'); await sleep(150);
await page.click('#m-settings'); await sleep(300); await shot('04-settings');
await page.click('#s-back'); await sleep(150);

// start via QA (skips story)
await page.evaluate(() => window.NOVAKI_QA.start({ seed: 42 }));
await sleep(500);
let s = await state();
if (s.screen !== 'playing') fail('expected playing, got ' + s.screen);
else ok('run started, screen=playing stage=' + s.stage);

// move around
await page.keyboard.down('d');
await sleep(1200);
await page.keyboard.up('d');
await page.keyboard.down('w');
await sleep(800);
await page.keyboard.up('w');
await page.keyboard.press(' '); // dash
await sleep(1200);
s = await state();
ok(`after move: player at ${s.player.x},${s.player.y} enemies=${s.enemies} hp=${s.player.hp}`);
await shot('05-gameplay-stage1');

// xp -> levelup
await page.evaluate(() => window.NOVAKI_QA.addXp(500));
await sleep(400);
s = await state();
if (s.screen !== 'levelup') fail('expected levelup screen, got ' + s.screen);
else ok('levelup opened, level=' + s.player.level);
await shot('06-levelup');
await page.evaluate(() => window.NOVAKI_QA.chooseUpgrade(0));
await sleep(200);
// consume remaining pending levelups
for (let i = 0; i < 20; i++) {
  s = await state();
  if (s.screen === 'levelup') { await page.evaluate(() => window.NOVAKI_QA.chooseUpgrade(0)); await sleep(120); }
  else break;
}
s = await state();
ok('after upgrades: screen=' + s.screen + ' upgrades=' + s.upgrades.join(','));

// pause menu
await page.keyboard.press('Escape');
await sleep(200);
s = await state();
if (s.screen !== 'paused') fail('expected paused, got ' + s.screen);
else ok('paused');
await shot('07-pause');
await page.keyboard.press('Escape');
await sleep(200);

// boss stage 1
await page.evaluate(() => window.NOVAKI_QA.skipTo(1, 'boss'));
await sleep(2500);
s = await state();
if (!s.bossActive) fail('boss not active after skipTo boss');
else ok('boss active');
await shot('08-boss1');
await page.evaluate(() => window.NOVAKI_QA.setInvincible(true));
await page.evaluate(() => window.NOVAKI_QA.killBoss());
await sleep(3600);
s = await state();
ok('after killBoss: screen=' + s.screen + ' bossActive=' + s.bossActive);
// transition story should show
if (s.screen !== 'story') fail('expected story transition, got ' + s.screen);
await shot('09-transition');
// advance two slides
await page.mouse.click(640, 400); await sleep(400);
await page.mouse.click(640, 400); await sleep(600);
s = await state();
if (s.screen !== 'playing' || s.stage !== 2) fail(`expected playing stage 2, got ${s.screen} stage ${s.stage}`);
else ok('stage 2 entered');
await sleep(2000);
await shot('10-stage2');

// stage 3 boss
await page.evaluate(() => window.NOVAKI_QA.skipTo(3, 'boss'));
await sleep(2500);
s = await state();
if (!s.bossActive || s.stage !== 3) fail('stage3 boss not active');
else ok('stage 3 boss active');
await shot('11-boss3');
await page.evaluate(() => window.NOVAKI_QA.killBoss());
await sleep(3200);
s = await state();
if (s.screen !== 'story') fail('expected ending story, got ' + s.screen);
await shot('12-ending');
await page.mouse.click(640, 400); await sleep(400);
await page.mouse.click(640, 400); await sleep(700);
s = await state();
if (s.screen !== 'victory') fail('expected victory, got ' + s.screen);
else ok('VICTORY screen, meta.wins=' + s.meta.unlocks);
await shot('13-victory');

// game over path: new run, drop hp via enemies
await page.evaluate(() => window.NOVAKI_QA.start({ seed: 7 }));
await sleep(400);
await page.evaluate(() => {
  window.NOVAKI_QA.spawnEnemies(60);
});
// make player fragile: stand still without invincibility
await sleep(6000);
s = await state();
ok('survival test: hp=' + s.player.hp + ' screen=' + s.screen);
await shot('14-swarmed');

// performance test
await page.evaluate(() => window.NOVAKI_QA.start({ seed: 99 }));
await sleep(500);
await page.evaluate(() => window.NOVAKI_QA.spawnEnemies(350));
await page.evaluate(() => window.NOVAKI_QA.setInvincible(true));
await sleep(300);
const fps = await page.evaluate(() => new Promise((resolve) => {
  let frames = 0;
  const t0 = performance.now();
  const loop = () => {
    frames++;
    if (performance.now() - t0 < 4000) requestAnimationFrame(loop);
    else resolve(frames / ((performance.now() - t0) / 1000));
  };
  requestAnimationFrame(loop);
}));
s = await state();
ok(`perf: ${fps.toFixed(1)} fps with ${s.enemies} enemies alive`);
await shot('15-perf');
if (fps < 55) fail('fps below 55 under load: ' + fps.toFixed(1));

console.log('\nconsole errors:', errors.length);
for (const e of errors.slice(0, 12)) console.log('  ', e.slice(0, 300));
if (errors.length > 0) process.exitCode = 1;

await browser.close();
server.close();
console.log('DONE');
