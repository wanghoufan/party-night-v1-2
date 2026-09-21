import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

/**
 * Service Worker cache 契约回归（T189 / FR-041 / FR-043）：
 * 直接跑 public/sw.js，用假的 Cache Storage / fetch 观察它到底把什么写进了离线缓存。
 * 断言的是行为（哪些 URL 落盘、旧 cache 是否清掉），不是源码字符串。
 */

interface FakeResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  clone(): FakeResponse;
}

interface FakeRequest {
  url: string;
  mode: string;
  method: string;
}

const response = (status = 200, cacheControl?: string): FakeResponse => {
  const headers: Record<string, string> = cacheControl ? { "cache-control": cacheControl } : {};
  const built: FakeResponse = { ok: status >= 200 && status < 300, status, headers: { get: (name) => headers[name.toLowerCase()] ?? null }, clone: () => response(status, cacheControl) };
  return built;
};

const request = (url: string, init: { mode?: string; method?: string } = {}): FakeRequest => ({ url, mode: init.mode ?? "cors", method: init.method ?? "GET" });

const VERSION = (JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version: string }).version;
const ORIGIN = "https://party-night.test";
const CACHE_NAME = `party-night-shell-v${VERSION}`;

class FakeCacheStorage {
  readonly stores = new Map<string, Map<string, FakeResponse>>();

  async open(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new Map());
    const entries = this.stores.get(name)!;
    return {
      addAll: async (urls: string[]) => { for (const url of urls) entries.set(new URL(url, ORIGIN).href, response()); },
      put: async (req: FakeRequest, res: FakeResponse) => { entries.set(req.url, res); },
      match: async (req: FakeRequest | string) => entries.get(typeof req === "string" ? new URL(req, ORIGIN).href : req.url),
    };
  }

  async keys() { return [...this.stores.keys()]; }
  async delete(name: string) { return this.stores.delete(name); }
  async match(req: FakeRequest | string) {
    const key = typeof req === "string" ? new URL(req, ORIGIN).href : req.url;
    for (const entries of this.stores.values()) { const hit = entries.get(key); if (hit) return hit; }
    return undefined;
  }

  allUrls(): string[] { return [...this.stores.values()].flatMap((entries) => [...entries.keys()]); }
}

interface Harness {
  caches: FakeCacheStorage;
  respond(request: FakeRequest, fetchImpl?: (req: FakeRequest) => Promise<FakeResponse>): Promise<FakeResponse | undefined>;
  activate(): Promise<void>;
  install(): Promise<void>;
}

/** SW 里的 cache 写入是“不阻塞响应”的后台任务，断言前先让它跑完。 */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function loadServiceWorker(): Harness {
  const source = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
  const caches = new FakeCacheStorage();
  const listeners = new Map<string, (event: never) => void>();
  let fetchImpl: (req: FakeRequest) => Promise<FakeResponse> = async () => response();

  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: (event: never) => void) => { listeners.set(type, handler); },
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };

  vm.runInNewContext(source, { self, caches, fetch: (req: FakeRequest) => fetchImpl(req), URL, Promise, console });

  const dispatch = (type: string, extra: Record<string, unknown>): Promise<unknown>[] => {
    const collected: Promise<unknown>[] = [];
    const event = { waitUntil: (promise: Promise<unknown>) => collected.push(promise), respondWith: (value: unknown) => collected.push(Promise.resolve(value)), ...extra };
    listeners.get(type)!(event as never);
    return collected;
  };

  return {
    caches,
    install: async () => { await Promise.all(dispatch("install", {})); },
    activate: async () => { await Promise.all(dispatch("activate", {})); },
    respond: async (req, impl) => {
      if (impl) fetchImpl = impl;
      const [returned] = dispatch("fetch", { request: req });
      const value = (await returned) as FakeResponse | undefined;
      await settle();
      return value;
    },
  };
}

describe("service worker cache policy", () => {
  it("keeps the rule catalog / seed chunks available offline while naming the cache after the app version", async () => {
    const sw = loadServiceWorker();
    await sw.install();

    expect([...sw.caches.stores.keys()]).toEqual([CACHE_NAME]);
    expect(sw.caches.allUrls()).toContain(new URL("/", ORIGIN).href);
    expect(sw.caches.allUrls()).toContain(new URL("/manifest.webmanifest", ORIGIN).href);

    // 规则库与本地 seed 都在 /_next/static 的 chunk 里：访问过一次就能离线再用
    await sw.respond(request(`${ORIGIN}/_next/static/chunks/lib-rules-catalog.js`));
    expect(sw.caches.allUrls()).toContain(`${ORIGIN}/_next/static/chunks/lib-rules-catalog.js`);

    // 离线导航回落到外壳，不白屏
    const shell = await sw.respond(request(`${ORIGIN}/game?session=x`, { mode: "navigate" }), async () => { throw new Error("offline"); });
    expect(shell?.status).toBe(200);
  });

  it("never caches the AI endpoints, provider responses or exported data", async () => {
    const sw = loadServiceWorker();
    await sw.install();

    // AI 接口：SW 根本不介入（不 respondWith、不落盘）
    expect(await sw.respond(request(`${ORIGIN}/api/generate-session`))).toBeUndefined();
    expect(await sw.respond(request(`${ORIGIN}/api/test-provider`, { method: "POST" }))).toBeUndefined();

    // 导出/备份走顶层导航下载时最容易被顺手缓存：必须挡住
    await sw.respond(request(`${ORIGIN}/export/party-night-data.json`, { mode: "navigate" }));
    await sw.respond(request(`${ORIGIN}/backup/sessions.json`, { mode: "navigate" }));
    // Provider 响应即使换到普通路径，只要声明 no-store/private 也不许落盘
    await sw.respond(request(`${ORIGIN}/_next/static/private-provider.json`), async () => response(200, "no-store, max-age=0"));

    expect(sw.caches.allUrls().filter((url) => /\/api\/|\/export\/|\/backup\/|private-provider/.test(url))).toEqual([]);
  });

  it("replaces the previous cache on activate so an old bundle cannot lock the app", async () => {
    const sw = loadServiceWorker();
    await sw.install();
    sw.caches.stores.set("party-night-shell-v0.9.0", new Map([[`${ORIGIN}/`, response()]]));
    sw.caches.stores.set("workbox-precache-v2-other", new Map());

    await sw.activate();

    expect([...sw.caches.stores.keys()]).toEqual([CACHE_NAME]);
  });

  it("only writes same-origin GET responses that are actually cacheable", async () => {
    const sw = loadServiceWorker();
    await sw.install();

    await sw.respond(request(`${ORIGIN}/api/x`, { method: "POST" }));
    await sw.respond(request("https://cdn.example.com/_next/static/chunks/a.js"));
    await sw.respond(request(`${ORIGIN}/_next/static/chunks/missing.js`), async () => response(404));

    expect(sw.caches.allUrls().filter((url) => /\/api\/x|cdn\.example\.com|missing/.test(url))).toEqual([]);
  });
});
