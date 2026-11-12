// 自動で作ったファイル（build.mjs）。元は tools/pwa/sw.js
self.H2D_SW = {"v":"22cc960afc","shell":["./","manifest.webmanifest","assets/icons/icon-192.png","assets/icons/apple-touch-icon.png"],"media":["assets/bank-tpl.js?v=bb86d81a79","assets/bgm/battle.m4a?v=b8097b129d","assets/bgm/defeat.m4a?v=4e77b43ffe","assets/bgm/menu.m4a?v=833828e114","assets/bgm/victory.m4a?v=601491f203"]};
// オフラインでも遊べるようにする係（配布版だけ）。build.mjs が先頭に「版・画面のファイル・素材の一覧」を入れる
//   画面（index.html）… つながっていれば毎回あたらしいものを取りにいき（4秒で来なければ保存ずみ）、つながらなければ保存ずみ
//   素材（問題の型・曲）… 一度使ったら（または設定の「この端末に保存」で）保存して、次からはそれを使う。曲の途中読み（Range）にも答える
const CONF = self.H2D_SW;
const SHELL_CACHE = 'h2d-shell-' + CONF.v;
const MEDIA_CACHE = 'h2d-media';
const abs = u => new URL(u, self.registration.scope).href;
const INDEX = abs('./');
const SHELL = new Set(CONF.shell.map(abs));
const MEDIA = new Set(CONF.media.map(abs));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(CONF.shell)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('h2d-shell-') && k !== SHELL_CACHE) await caches.delete(k);
    // 古い版の素材は消す（新しい版は、使ったとき・ページが自動でそろえるときに保存）
    const mc = await caches.open(MEDIA_CACHE);
    for (const req of await mc.keys()) if (!MEDIA.has(req.url)) await mc.delete(req);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') { e.respondWith(page(req, e)); return; }
  if (MEDIA.has(url.href)) { e.respondWith(media(req)); return; }
  if (SHELL.has(url.href)) e.respondWith(caches.open(SHELL_CACHE).then(c => c.match(url.href)).then(r => r || fetch(req)));
});

async function page(req, e) {
  const cache = await caches.open(SHELL_CACHE);
  const path = new URL(req.url).pathname, scope = new URL(INDEX).pathname;
  const isIndex = path === scope || path === scope + 'index.html';
  const net = fetch(req).then(res => {
    if (isIndex && res.ok && res.type === 'basic') { const copy = res.clone(); e.waitUntil(cache.put(INDEX, copy)); }
    return res;
  });
  try {
    return await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
  } catch (err) {
    const hit = isIndex ? await cache.match(INDEX) : null;
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  }
}

async function media(req) {
  const cache = await caches.open(MEDIA_CACHE);
  let res = await cache.match(req.url);
  if (!res) {
    const net = await fetch(req.url);          // Range をつけずに丸ごと取る
    if (!net.ok) return net;
    await cache.put(req.url, net.clone());
    res = net;
  }
  const range = req.headers.get('range');
  if (!range) return res;
  const buf = await res.arrayBuffer(), size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] ? Number(m[1]) : 0, end = m[2] ? Number(m[2]) : size - 1;
  if (!m[1] && m[2]) { start = Math.max(0, size - Number(m[2])); end = size - 1; }
  end = Math.min(end, size - 1);
  if (start >= size || end < start) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(buf.slice(start, end + 1), { status: 206, headers: {
    'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
    'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes',
  } });
}
