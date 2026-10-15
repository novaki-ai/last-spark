import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const DIST = path.resolve('dist');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.ogg': 'audio/ogg' };
const server = http.createServer((req, res) => {
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
await new Promise((r) => server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}/sub/path/`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 300)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 500)));
await page.goto(BASE, { waitUntil: 'networkidle' });
await new Promise((r) => setTimeout(r, 5000));
const info = await page.evaluate(() => ({
  qa: typeof window.NOVAKI_QA,
  state: window.NOVAKI_QA ? window.NOVAKI_QA.state() : null,
  overlayHtml: document.getElementById('overlay')?.innerHTML?.slice(0, 200),
}));
console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: 'shots/debug.png' });
await browser.close();
server.close();
