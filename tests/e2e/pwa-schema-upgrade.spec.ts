import { expect, test } from "@playwright/test";
import { countSessions, currentSessionId, readQuarantinedSession, readSession, seedSession } from "./helpers";

/**
 * V1.x → V1.2 升级（T200 / FR-043 / SC-013）：
 * 旧 Session fixture（schemaVersion=1，缺 currentPackId）在新 bundle 下必须被幂等迁移、active Session 仍可恢复；
 * 迁移失败只隔离坏记录、绝不整库清空；新版本写的数据只读不动。
 */

const players = ["Alex", "Emma", "Kai"].map((displayName, index) => ({ id: `p${index + 1}`, displayName, active: true, createdAt: "2026-09-20T00:00:00.000Z", lastUsedAt: "2026-09-20T00:00:00.000Z" }));

const cards = [
  { id: "legacy-c1", packId: "truth-dare", type: "truth", content: "说一件今天的开心事", instruction: "轮到的玩家回答", intensity: 1, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "single", source: "builtin" },
  { id: "legacy-c2", packId: "never-have", type: "statement", content: "我从来没有假装看懂一部电影。", instruction: "做过的人举手", intensity: 2, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "all", source: "builtin" },
];

/** V1.1 落库形态：schemaVersion=1，没有 currentPackId / currentPackState / recentRejectedFingerprints。 */
const legacySession = {
  schemaVersion: 1,
  id: "legacy-session-1",
  status: "active",
  mode: "mixed",
  config: {
    players, relationship: "friends", vibes: ["funny"], intensity: 3,
    boundaries: { noPhysicalContact: false, noAlcoholPenalty: true, noExPartners: false, noSexualHistory: false, noMoneyIncome: false, noPhonePrivacy: true, noPublicPosting: true, noStrangerContact: true, noPhotoVideo: false, noSocialAccounts: false, customText: "" },
    enabledPackIds: ["truth-dare", "never-have"], mode: "mixed",
  },
  deckSnapshot: cards, usedCardIds: [], rounds: [],
  startedAt: "2026-09-20T00:00:00.000Z", updatedAt: "2026-09-21T00:00:00.000Z",
};

test("旧 Session fixture 升级后仍可恢复，迁移幂等且不清库", async ({ page }) => {
  await seedSession(page, legacySession as never);
  // 同一个库里再放一条坏记录：升级只能隔离它，不能顺手清空整库
  await seedSession(page, { id: "corrupt-1", status: "active", rounds: [{ packId: 5 }] } as never);

  await page.goto("/");
  // 首页照常启动（不白屏），并给出「继续上一局」
  await expect(page.getByText("继续上一局")).toBeVisible();
  await page.getByRole("link", { name: /继续/ }).click();
  await page.waitForURL(/\/game\?session=/);

  const id = currentSessionId(page);
  expect(id).toBe("legacy-session-1");
  await expect(page.locator(".game-card")).toBeVisible();

  // 迁移结果：schema 升到当前版本；currentPackId 落在启用包内
  // （页面加载瞬间会随机 deal 一张并跟随更新，故不断言具体是哪个包；推导规则由单测覆盖）
  const migrated = await readSession(page, "legacy-session-1");
  expect(migrated.schemaVersion).toBe(2);
  expect(["truth-dare", "never-have"]).toContain(migrated.currentPackId);
  expect(migrated.rounds).toEqual([]);

  // 坏记录被隔离、原始内容保留，有效记录还在
  expect((await readQuarantinedSession(page, "corrupt-1"))?.reason).toBe("deserialize-failed");
  expect(await countSessions(page)).toBe(1);

  // 再刷新一次：迁移幂等，不清库、不重复失败
  await page.reload();
  await expect(page.locator(".game-card")).toBeVisible();
  expect(await countSessions(page)).toBe(1);
  expect(["truth-dare", "never-have"]).toContain((await readSession(page, "legacy-session-1")).currentPackId);
});

test("新版本写的数据在旧 bundle 下只读不动，不被迁移也不被清除", async ({ page }) => {
  await seedSession(page, legacySession as never);
  const future = { ...legacySession, schemaVersion: 99, id: "future-session-9", currentPackId: "future-pack" };
  await seedSession(page, future as never);

  await page.goto("/");
  await expect(page.getByText("继续上一局")).toBeVisible();

  // 可用的旧 Session 照常恢复
  const restored = await readSession(page, "legacy-session-1");
  expect(restored.schemaVersion).toBe(2);

  // 新版本记录原样保留：既没被改写，也没被删进隔离区
  expect(await readSession(page, "future-session-9")).toEqual(future);
  expect(await readQuarantinedSession(page, "future-session-9")).toBeUndefined();
});

test("旧 cache + 新 bundle：版本错位后 Session 仍能恢复", async ({ page, context }) => {
  test.skip(process.env.PARTY_NIGHT_PRODUCTION_SMOKE !== "true", "仅针对 production build（真实 Service Worker）运行");

  await context.addInitScript(() => {
    if (sessionStorage.getItem("party-night-upgrade-stale-cache")) return;
    sessionStorage.setItem("party-night-upgrade-stale-cache", "1");
    void caches.open("party-night-shell-v0.0.0").then((cache) => cache.put("/stale-shell.html", new Response("stale")));
  });

  await seedSession(page, legacySession as never);
  await page.goto("/");
  await expect.poll(async () => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)).toBe("activated");
  await expect.poll(async () => page.evaluate(async () => (await caches.keys()).join(","))).toMatch(/^party-night-shell-v\d+\.\d+\.\d+$/);

  await page.reload();
  await expect(page.getByText("继续上一局")).toBeVisible();
  await page.getByRole("link", { name: /继续/ }).click();
  await expect(page.locator(".game-card")).toBeVisible();

  const migrated = await readSession(page, "legacy-session-1");
  expect(migrated.schemaVersion).toBe(2);
  expect(["truth-dare", "never-have"]).toContain(migrated.currentPackId);
  // 旧 cache 已被新版本清掉，且里面没有遗留的旧壳
  expect(await page.evaluate(async () => (await caches.keys()).length)).toBe(1);
  expect(await page.evaluate(async () => (await caches.keys()).join(","))).not.toContain("v0.0.0");
});
