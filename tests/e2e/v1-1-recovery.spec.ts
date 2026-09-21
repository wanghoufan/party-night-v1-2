import { expect, test, type Page } from "@playwright/test";
import { currentSessionId, readQuarantinedSession, readSession, seedSession, startLocalGame, startPackGame } from "./helpers";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { GameCard, GameSession, Intensity } from "@/lib/domain/schemas";

/**
 * V1.1 恢复回归（T187/T188 / US9 / FR-008、FR-020、FR-034、FR-035）：
 * 重要动作落库后，刷新与 PWA reload 都必须把当前玩法与玩法局部状态原样带回来。
 */

const switchEntry = (page: Page) => page.getByRole("button", { name: /切换玩法/ });

// ---------- 转瓶子：stable result 先落库，刷新只恢复最终落点 ----------

const SPIN_SESSION_ID = "e2e-recovery-spin-session";

function spinSession(): GameSession {
  const now = new Date().toISOString();
  const players = [["p1", "Alex"], ["p2", "Emma"], ["p3", "Kai"]].map(([id, displayName]) => ({ id: id!, displayName: displayName!, active: true, createdAt: now, lastUsedAt: now }));
  return {
    schemaVersion: 2, id: SPIN_SESSION_ID, status: "active", mode: "single",
    config: {
      players, relationship: "friends", vibes: ["funny"], intensity: 3 as Intensity,
      boundaries: { noPhysicalContact: false, noAlcoholPenalty: true, noExPartners: false, noSexualHistory: false, noMoneyIncome: false, noPhonePrivacy: true, noPublicPosting: true, noStrangerContact: true, noPhotoVideo: false, noSocialAccounts: false, customText: "" },
      enabledPackIds: ["spin-bottle", "truth-dare"], mode: "single",
    },
    deckSnapshot: BUILTIN_SEED_CARDS.filter((card) => card.packId === "truth-dare"),
    usedCardIds: [], rounds: [], currentPackId: "spin-bottle", currentPackState: {}, recentRejectedFingerprints: [],
    startedAt: now, updatedAt: now,
  };
}

/** 固定这一次点击的随机源：落点确定后动画只是表现，测试不依赖真实随机。 */
async function spinOnce(page: Page, roll = 0.1) {
  await page.evaluate((value) => {
    const scope = window as unknown as { __partyRealRandom?: () => number };
    scope.__partyRealRandom = Math.random;
    Math.random = () => value;
  }, roll);
  try {
    await page.getByRole("button", { name: "开始旋转" }).click();
  } finally {
    await page.evaluate(() => {
      const scope = window as unknown as { __partyRealRandom?: () => number };
      if (scope.__partyRealRandom) Math.random = scope.__partyRealRandom;
    });
  }
}

test("转瓶子：落点落库后刷新直接回到结果页，不停在 ready、也不重播动画", async ({ page }) => {
  await seedSession(page, spinSession());
  await page.goto(`/game?session=${SPIN_SESSION_ID}`);
  await expect(page.locator(".spin-bottle")).toHaveAttribute("data-phase", "ready");

  await spinOnce(page);
  await expect(page.locator(".spin-bottle__target")).toHaveText("🎯 Alex");
  await expect(page.locator(".spin-bottle")).toHaveAttribute("data-phase", "result");
  expect((await readSession(page, SPIN_SESSION_ID)).currentPackState?.["spin-bottle"]).toEqual({ lastSelectedPlayerId: "p1" });

  await page.reload();

  await expect(page.locator(".spin-bottle")).toHaveAttribute("data-phase", "result");
  await expect(page.locator(".spin-bottle__target")).toHaveText("🎯 Alex");
});

test("转瓶子：链入真心话后刷新，仍是同一局、同一被指到的人、同一张真心话", async ({ page }) => {
  await seedSession(page, spinSession());
  await page.goto(`/game?session=${SPIN_SESSION_ID}`);
  await spinOnce(page);
  await expect(page.locator(".spin-bottle__target")).toHaveText("🎯 Alex");

  await page.getByRole("button", { name: "真心话" }).click();
  await expect(page.locator(".game-card__pack")).toContainText("真心话");
  const chained = await readSession(page, SPIN_SESSION_ID);
  const dealtId = chained.currentRound?.cardId;

  await page.reload();

  await expect(page.locator(".game-card__pack")).toContainText("真心话");
  const restored = await readSession(page, SPIN_SESSION_ID);
  expect(restored.id).toBe(SPIN_SESSION_ID);
  expect(restored.currentPackId).toBe("truth-dare");
  expect(restored.currentRound?.cardId).toBe(dealtId);
  expect(restored.currentRound?.participantIds).toEqual(["p1"]);
  expect(restored.deckSnapshot.find((card: GameCard) => card.id === dealtId)?.type).toBe("truth");
});

// ---------- 主局内切换新玩法：完成 / 换一个各自落库 ----------

test("主局切到二选一：完成与换一个分别落库，刷新后玩法、轮次历史与计数都连续", async ({ page }) => {
  await startPackGame(page, /我从来没有/);
  const id = currentSessionId(page);

  await switchEntry(page).click();
  await page.getByRole("dialog", { name: "切换玩法" }).getByRole("button", { name: /二选一/ }).click();
  await expect(switchEntry(page)).toContainText("二选一");
  await expect(page.locator(".would-you-rather")).toBeVisible();

  // 第一轮：下一题 → completed
  await page.getByRole("button", { name: "下一题" }).click();
  await expect(page.locator(".would-you-rather")).toBeVisible();
  // 第二轮：换一个 → swapped（拒绝当前题面）
  await page.getByRole("button", { name: "换一个" }).click();
  await expect(page.locator(".would-you-rather")).toBeVisible();

  // 切玩法会把切换前未完成的那一轮记为 skipped（无惩罚跳过），之后两轮才是新玩法的完成/换一个
  await expect.poll(async () => (await readSession(page, id)).rounds.map((round) => round.status)).toEqual(["skipped", "completed", "swapped"]);

  await page.reload();

  await expect(switchEntry(page)).toContainText("二选一");
  await expect(page.locator(".would-you-rather")).toBeVisible();
  await expect(page.getByText(/第 4 \/ /)).toBeVisible();
  const restored = await readSession(page, id);
  expect(restored.currentPackId).toBe("would-you-rather");
  expect(restored.rounds.map((round) => round.status)).toEqual(["skipped", "completed", "swapped"]);
  expect(restored.rounds.slice(1).map((round) => round.packId)).toEqual(["would-you-rather", "would-you-rather"]);
  expect(restored.recentRejectedFingerprints?.length).toBeGreaterThan(0);
});

test("默契测试：判分落库后重新打开这一局（冷启动）仍恢复配对与分数", async ({ page }) => {
  await startPackGame(page, /我从来没有/);
  const id = currentSessionId(page);

  await switchEntry(page).click();
  await page.getByRole("dialog", { name: "切换玩法" }).getByRole("button", { name: /默契测试/ }).click();
  await expect(page.locator(".compatibility-game")).toBeVisible();

  await page.getByRole("button", { name: "一样 ❤️" }).click();
  await expect(page.locator(".compat-game__score")).toHaveText("默契 1/1");
  await page.getByRole("button", { name: "下一题" }).click();
  await expect(page.locator(".compat-game__score")).toHaveText("默契 1/1");
  await page.getByRole("button", { name: "不一样 😂" }).click();
  await expect(page.locator(".compat-game__score")).toHaveText("默契 1/2");

  // 冷启动（模拟 PWA 被杀后重新打开）：直接按 URL 重新进入，读库路径与刷新一致
  await page.goto(`/game?session=${id}`);

  await expect(page.locator(".compatibility-game")).toBeVisible();
  await expect(page.locator(".compat-game__score")).toHaveText("默契 1/2");
  const restored = await readSession(page, id);
  expect(restored.currentPackId).toBe("compatibility-test");
  expect(restored.currentPackState?.compatibility).toMatchObject({ score: 1, rounds: 2 });
  // 首轮是切玩法前那一轮的 skipped 收尾，之后才是默契测试自己的完成轮
  expect(restored.rounds.map((round) => round.status)).toEqual(["skipped", "completed"]);
});

// ---------- 坏 Session：隔离记录 + 安全回首页，不白屏 ----------

const LEGACY_SESSION_ID = "e2e-legacy-session";

/** V1.x 落库形态：schemaVersion=1、缺 currentPackId/packState，靠 migration 在读取时补齐（FR-043）。 */
function legacySession(): GameSession {
  const time = new Date().toISOString();
  const players = [["p1", "Alex"], ["p2", "Emma"]].map(([id, displayName]) => ({ id: id!, displayName: displayName!, active: true, createdAt: time, lastUsedAt: time }));
  const card: GameCard = { id: "legacy-card", packId: "truth-dare", type: "truth", content: "你最近一次撒谎是什么时候？", intensity: 2 as Intensity, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "single", source: "builtin" };
  return {
    schemaVersion: 1, id: LEGACY_SESSION_ID, status: "active", mode: "mixed",
    config: { players, relationship: "friends", vibes: ["funny"], intensity: 3 as Intensity, boundaries: { ...DEFAULT_BOUNDARIES }, enabledPackIds: ["truth-dare", "never-have"], mode: "mixed" },
    deckSnapshot: [card], usedCardIds: ["legacy-card"],
    rounds: [{ id: "legacy-round", cardId: "legacy-card", packId: "never-have", participantIds: ["p1"], status: "completed", startedAt: time, endedAt: time }],
    startedAt: time, updatedAt: time,
  } as unknown as GameSession;
}

test("坏 Session：反序列化失败的记录被隔离，页面安全回首页而不是白屏", async ({ page }) => {
  await seedSession(page, { id: "e2e-broken-session", status: "active", config: "not-an-object" } as unknown as GameSession);

  await page.goto("/game?session=e2e-broken-session");

  // 安全落点：回首页（首页可点），而不是空白页或错误页
  await expect(page.getByRole("link", { name: /今晚开局/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "游戏包", exact: true })).toBeVisible();

  // 记录不是被删掉：原始内容进隔离区，sessions 里不再留下每次启动都会失败的坏记录
  expect(await readSession(page, "e2e-broken-session")).toBeUndefined();
  const quarantined = await readQuarantinedSession(page, "e2e-broken-session");
  expect(quarantined?.reason).toBe("deserialize-failed");
  expect(quarantined?.raw).toEqual({ id: "e2e-broken-session", status: "active", config: "not-an-object" });
});

test("坏 Session：旁边有效的旧记录仍可继续，首页照常给“继续上一局”", async ({ page }) => {
  await seedSession(page, legacySession());
  await seedSession(page, { id: "e2e-broken-session", status: "active" } as unknown as GameSession);

  await page.goto("/");

  // 有效旧记录照常出现在首页；坏记录被隔离但不影响它
  await expect(page.getByText("继续上一局")).toBeVisible();
  await expect(page.getByText(/已完成 1 轮/)).toBeVisible();
  // 迁移是非破坏的：原始 v1 记录不被就地改写，读取时才在内存里补齐
  expect((await readSession(page, LEGACY_SESSION_ID))?.schemaVersion).toBe(1);
  expect((await readQuarantinedSession(page, "e2e-broken-session"))?.reason).toBe("deserialize-failed");
});

// ---------- PWA reload：由已激活的 Service Worker 提供外壳 ----------

test("PWA reload：Service Worker 接管后，切新玩法并转瓶子，落点与当前玩法一并恢复", async ({ page }) => {
  // 只有 production build 才注册 Service Worker，dev 下这条用例没有意义（顶层 test.skip 会跳过整个文件，故写在体内）
  test.skip(process.env.PARTY_NIGHT_PRODUCTION_SMOKE !== "true", "仅针对 production build 运行（需要真实 Service Worker）");

  await startLocalGame(page);
  await expect.poll(async () => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)).toBe("activated");
  const id = currentSessionId(page);

  await switchEntry(page).click();
  await page.getByRole("dialog", { name: "切换玩法" }).getByRole("button", { name: /转瓶子/ }).click();
  await expect(page.locator(".spin-bottle")).toBeVisible();

  await spinOnce(page);
  await expect(page.locator(".spin-bottle__result")).toBeVisible();
  const targetName = ((await page.locator(".spin-bottle__target").textContent()) ?? "").replace("🎯 ", "");
  const stored = await readSession(page, id);
  const spinState = stored.currentPackState?.["spin-bottle"] as { lastSelectedPlayerId?: string } | undefined;
  const picked = stored.config.players.find((player) => player.id === spinState?.lastSelectedPlayerId);
  expect(picked?.displayName).toBe(targetName);

  await page.reload();

  await expect(page.locator(".spin-bottle__result")).toBeVisible();
  await expect(page.locator(".spin-bottle__target")).toHaveText(`🎯 ${targetName}`);
  expect((await readSession(page, id)).currentPackId).toBe("spin-bottle");
});
