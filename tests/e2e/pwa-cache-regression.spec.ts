import { expect, test } from "@playwright/test";

/**
 * PWA / Service Worker cache 回归（T189 / FR-041、FR-043 / SC-012）：
 * 在 production build 上跑真 Service Worker，直接看 Cache Storage 里到底有什么。
 * 覆盖：版本化 cache + 旧 cache 清理、新静态（规则库）可离线、AI 接口与 API Key 不进缓存。
 */

const KEY = "sk-pwa-cache-must-not-store-123456";

async function cachedUrls(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const urls: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) urls.push(request.url);
    }
    return urls;
  });
}

test("PWA cache：版本化 cache + 旧 cache 清理 + 规则库离线 + AI 接口与密钥不进缓存", async ({ page, context }) => {
  test.skip(process.env.PARTY_NIGHT_PRODUCTION_SMOKE !== "true", "仅针对 production build 运行（需要真实 Service Worker）");

  // 预置一个上一版本的 cache：新 SW 激活时必须清掉，旧 bundle 不能把新版本锁死。
  // 只在首个文档注入一次（sessionStorage 标记），否则每次导航都会把它重新加回来。
  await context.addInitScript(() => {
    if (sessionStorage.getItem("party-night-stale-cache-seeded")) return;
    sessionStorage.setItem("party-night-stale-cache-seeded", "1");
    void caches.open("party-night-shell-v0.0.0").then((cache) => cache.put("/stale-shell.html", new Response("stale")));
  });

  await page.goto("/");
  await expect.poll(async () => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)).toBe("activated");
  await expect.poll(async () => page.evaluate(async () => (await caches.keys()).join(","))).toMatch(/^party-night-shell-v\d+\.\d+\.\d+$/);

  // 规则库（新静态 catalog / 本地 seed chunk）访问一次后，断网重载仍能打开
  await page.goto("/packs?tab=rules");
  const rules = page.getByRole("region", { name: "规则" }).getByRole("link");
  await expect(rules).toHaveCount(8);
  await context.setOffline(true);
  await page.reload();
  await expect(rules).toHaveCount(8);
  await context.setOffline(false);

  // 存一个 BYOK：密钥只在加密库里，不得被任何 cache 响应带走
  await page.goto("/settings/ai");
  await page.getByRole("textbox", { name: "API Key", exact: true }).fill(KEY);
  await page.getByRole("button", { name: "保存配置" }).click();

  // 真调一次 AI 接口（无 key → 401，请求仍经过 Service Worker 的 fetch 处理器）
  const status = await page.evaluate(() => fetch("/api/test-provider", { method: "POST" }).then((response) => response.status));
  expect(status).toBe(401);

  const urls = await cachedUrls(page);
  expect(urls.filter((url) => url.includes("/api/"))).toEqual([]);
  expect(urls.filter((url) => url.includes("stale-shell"))).toEqual([]);

  const bodies = await page.evaluate(async () => {
    const texts: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const response = await cache.match(request);
        if (response) texts.push(await response.clone().text());
      }
    }
    return texts;
  });
  expect(bodies.join("\n")).not.toContain(KEY);
  expect(await page.evaluate(async () => (await caches.keys()).length)).toBe(1);
});
