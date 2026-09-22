import { expect, test, type Page } from "@playwright/test";
import { currentSessionId, readSession, seedSession } from "./helpers";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import type { GameCard, GameSession, Intensity } from "@/lib/domain/schemas";

const SESSION_ID = "e2e-spin-bottle-session";

/** 转瓶子是纯本地玩法：题卡只有现有 truth-dare，转瓶子自己不占卡（US6 / T121）。 */
function spinSession(inactiveEmma = false): GameSession {
  const now = new Date().toISOString();
  const players = [["p1", "Alex"], ["p2", "Emma"], ["p3", "Kai"]].map(([id, displayName]) => ({
    id: id!, displayName: displayName!, active: !(inactiveEmma && id === "p2"), createdAt: now, lastUsedAt: now,
  }));
  return {
    schemaVersion: 2, id: SESSION_ID, status: "active", mode: "single",
    config: {
      players, relationship: "friends", vibes: ["funny"], intensity: 3 as Intensity,
      boundaries: { noPhysicalContact: false, noAlcoholPenalty: true, noExPartners: false, noSexualHistory: false, noMoneyIncome: false, noPhonePrivacy: true, noPublicPosting: true, noStrangerContact: true, noPhotoVideo: false, noSocialAccounts: false, customText: "" },
      enabledPackIds: ["spin-bottle", "truth-dare"], mode: "single",
    },
    deckSnapshot: BUILTIN_SEED_CARDS.filter((card) => card.packId === "truth-dare"),
    usedCardIds: [], rounds: [],
    currentPackId: "spin-bottle", currentSegmentId: "e2e-segment", currentPackState: {}, recentRejectedFingerprints: [],
    startedAt: now, updatedAt: now,
  };
}

const view = (page: Page) => page.locator(".spin-bottle");
const result = (page: Page) => page.locator(".spin-bottle__result");
const spinButton = (page: Page) => page.getByRole("button", { name: "开始旋转" });
const target = (page: Page) => page.locator(".spin-bottle__target");

async function openSpinSession(page: Page, inactiveEmma = false) {
  await seedSession(page, spinSession(inactiveEmma));
  await page.goto(`/game?session=${SESSION_ID}`);
  await expect(view(page)).toBeVisible();
}

/**
 * 固定随机源只覆盖这一次点击：转瓶子结果先由 selectEligiblePlayer 定下，动画不参与随机。
 * roll 固定后落点可复现（例如 3 人 pool 里的 0.1 → 第一个在场玩家）。
 */
async function spinWithFixedRandom(page: Page, click: () => Promise<void>, roll = 0.1) {
  await page.evaluate((value) => {
    const scope = window as unknown as { __partyRealRandom?: () => number };
    scope.__partyRealRandom = Math.random;
    Math.random = () => value;
  }, roll);
  try {
    await click();
  } finally {
    await page.evaluate(() => {
      const scope = window as unknown as { __partyRealRandom?: () => number };
      if (scope.__partyRealRandom) Math.random = scope.__partyRealRandom;
    });
  }
}

test("转瓶子：固定 RNG 命中 Alex → 真心话链入现有 truth-dare（被指到的人作答）→ 完成 → 同一局继续", async ({ page }) => {
  await openSpinSession(page);
  const before = await readSession(page, SESSION_ID);
  // 未转之前没有结果，也没有半截动画
  await expect(result(page)).toHaveCount(0);
  await expect(view(page)).toHaveAttribute("data-phase", "ready");

  await spinWithFixedRandom(page, () => spinButton(page).click());
  await expect(target(page)).toHaveText("🎯 Alex");
  await expect(view(page)).toHaveAttribute("data-phase", "result");
  // 结果先落库（stable result）：动画只是表现，刷新不会恢复半截旋转
  expect((await readSession(page, SESSION_ID)).currentPackState?.["spin-bottle"]).toEqual({ lastSelectedPlayerId: "p1" });

  await page.getByRole("button", { name: "真心话" }).click();
  const chained = await readSession(page, SESSION_ID);
  expect(chained.currentPackId).toBe("truth-dare");
  expect(chained.currentRound?.packId).toBe("truth-dare");
  expect(chained.currentRound?.participantIds).toEqual(["p1"]);
  const dealt = chained.deckSnapshot.find((card) => card.id === chained.currentRound?.cardId) as GameCard;
  expect(dealt.type).toBe("truth");
  expect(dealt.packId).toBe("truth-dare");
  // 链入现有真心话大冒险：不是第二套玩法/第二个 Session
  await expect(page.locator(".game-card h1")).toHaveText(dealt.content);
  await expect(page.getByRole("button", { name: /切换玩法/ })).toContainText("真心话大冒险");
  expect(chained.id).toBe(SESSION_ID);
  expect(chained.config).toEqual(before.config);

  // 完成 → V1.5 链自动回跳：同一段内切回转瓶子 ready（题面消失），历史里留下被指到的人
  await page.getByRole("button", { name: "完成" }).click();
  await expect(view(page)).toBeVisible();
  await expect(view(page)).toHaveAttribute("data-phase", "ready");
  await expect(page.locator(".game-card h1")).toHaveCount(0);
  await expect(page.getByText(/第 2 \/ /)).toBeVisible();
  const done = await readSession(page, SESSION_ID);
  expect(done.currentPackId).toBe("spin-bottle");
  expect((done.currentPackState?.["spin-bottle"] as { chain?: { phase?: string } } | undefined)?.chain?.phase).toBe("returning");
  expect(done.rounds.map((round) => round.packId)).toEqual(["truth-dare"]);
  expect(done.rounds[0]!.participantIds).toEqual(["p1"]);
  expect(done.rounds[0]!.status).toBe("completed");
  // 回跳不重置落点：Alex 仍记为上一次落点，下一转据此避开他
  expect(done.currentPackState?.["spin-bottle"]).toMatchObject({ lastSelectedPlayerId: "p1" });

  // 同一局继续：不点切换面板（当前玩法已是转瓶子），直接再转一次，落点仍可复现
  await expect(page.getByRole("button", { name: /切换玩法/ })).toContainText("转瓶子");
  await spinWithFixedRandom(page, () => spinButton(page).click());
  await expect(target(page)).toHaveText("🎯 Emma");
  expect((await readSession(page, SESSION_ID)).id).toBe(SESSION_ID);
});

test("转瓶子：连续两转不指同一人；刷新只恢复最终落点；再转一次仍可复现", async ({ page }) => {
  await openSpinSession(page);

  await spinWithFixedRandom(page, () => spinButton(page).click(), 0.1);
  await expect(target(page)).toHaveText("🎯 Alex");

  // 再转一次：同一个 roll，但上一轮的 Alex 已被排除，落到下一位在场玩家
  await spinWithFixedRandom(page, () => page.getByRole("button", { name: "再转一次" }).click(), 0.1);
  await expect(target(page)).toHaveText("🎯 Emma");
  expect((await readSession(page, SESSION_ID)).currentPackState?.["spin-bottle"]).toEqual({ lastSelectedPlayerId: "p2" });

  // 刷新：直接回到结果页（最终落点），不复播动画
  await page.reload();
  await expect(view(page)).toHaveAttribute("data-phase", "result");
  await expect(target(page)).toHaveText("🎯 Emma");
  await expect(spinButton(page)).toHaveCount(0);

  await spinWithFixedRandom(page, () => page.getByRole("button", { name: "再转一次" }).click(), 0.1);
  await expect(target(page)).toHaveText("🎯 Alex");
  expect(currentSessionId(page)).toBe(SESSION_ID);
});

test("转瓶子：只从在场玩家中选人，大冒险同样链入 dare 卡", async ({ page }) => {
  await openSpinSession(page, true); // Emma 临时离场
  await expect(page.locator(".spin-bottle__seat")).toHaveCount(2);
  await expect(view(page).getByText("Emma")).toHaveCount(0);

  await spinWithFixedRandom(page, () => spinButton(page).click(), 0.9);
  await expect(target(page)).toHaveText("🎯 Kai");

  await page.getByRole("button", { name: "大冒险" }).click();
  const chained = await readSession(page, SESSION_ID);
  expect(chained.currentPackId).toBe("truth-dare");
  expect(chained.currentRound?.participantIds).toEqual(["p3"]);
  const dealt = chained.deckSnapshot.find((card) => card.id === chained.currentRound?.cardId) as GameCard;
  expect(dealt.type).toBe("dare");
  await expect(page.locator(".game-card h1")).toHaveText(dealt.content);
});
