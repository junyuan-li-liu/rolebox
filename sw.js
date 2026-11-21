/* 角色匣 · Service Worker
 * 策略：同源 GET 一律「网络优先 + 成功就更新缓存」，离线时回退缓存。
 *
 * 2026-11-21 修订（v2）：
 *   1. HTML 导航请求加 cache: 'no-store'。GitHub Pages 给 index.html 设了 max-age=600，
 *      不绕过的话改完代码 10 分钟内打开仍是旧页面，用户会以为"必须清缓存"。
 *   2. CACHE 名升到 rolebox-v2，activate 时把 v1 一起清掉，避免有人卡在旧壳里。
 */
const CACHE = 'rolebox-v2';
const CORE = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(CORE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  // 只管同源；接口请求（api.deepseek.com 等）直接放行，不进缓存
  if (url.origin !== self.location.origin) return;

  const isNav = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').indexOf('text/html') >= 0;

  const net = isNav
    ? fetch(new Request(req.url, { cache: 'no-store', credentials: 'same-origin', redirect: 'follow' }))
    : fetch(req);

  e.respondWith(
    net
      .then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
