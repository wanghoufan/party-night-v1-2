// Party Night Service Worker（PWA 外壳）：只缓存「应用外壳 + 静态资源」，让已访问过的页面离线可用。
// 缓存契约（T189 / FR-041 / FR-043）：
//   1) cache 名带应用版本；activate 时清掉所有旧版本 cache，旧 bundle 不会锁死新版本。
//   2) AI/Provider 接口与任何导出/备份数据永不进 cache（路径前缀 + Cache-Control 双重拦截）。
//   3) 只缓存同源 GET 的 2xx 响应；离线导航回落到外壳，不白屏。
// 改这里的缓存名单时同步改 public/sw.js 的 CACHE_VERSION 与 package.json 的 version。
const CACHE_VERSION = "1.2.0";
const CACHE_NAME = `party-night-shell-v${CACHE_VERSION}`;
const SHELL = ["/", "/manifest.webmanifest", "/brand/party-night-logo.svg", "/brand/party-night-mark.svg", "/icons/icon-192.png", "/icons/icon-512.png"];
/** 永不进 cache 的路径前缀：AI 生成、Provider 测试、导出/备份数据（含顶层导航下载）。 */
const NEVER_CACHE_PREFIXES = ["/api/", "/export/", "/backup/"];
/** 需要离线可用的静态资源前缀：规则库/本地 seed 的 chunk 都在这里，访问过一次即可离线再用。 */
const CACHEABLE_STATIC_PREFIXES = ["/_next/static/"];

const isNeverCached = (url) => NEVER_CACHE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
const isCacheableStatic = (url) => CACHEABLE_STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
/** 声明不可缓存（no-store/private）的子资源一律不落盘；导航外壳例外，否则 PWA 无法离线打开。 */
const forbidsCache = (request, response) => {
  if (request.mode === "navigate") return false;
  const header = response.headers.get("Cache-Control") || "";
  return /no-store|private/i.test(header);
};
const isCacheable = (request, url, response) =>
  request.method === "GET" && url.origin === self.location.origin && !isNeverCached(url) && !forbidsCache(request, response)
  && response.ok && (request.mode === "navigate" || isCacheableStatic(url) || SHELL.includes(url.pathname));

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== "GET" || isNeverCached(url)) return;
  event.respondWith(fetch(request).then((response) => {
    if (isCacheable(request, url, response)) {
      const clone = response.clone();
      void caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
    }
    return response;
  }).catch(() => caches.match(request).then((cached) => cached || (request.mode === "navigate" ? caches.match("/") : undefined))));
});
