import { expect, test, type Page } from "@playwright/test";
import { readSession, seedSession, startLocalGame } from "./helpers";
import type { GameCard, GameSession, Intensity } from "@/lib/domain/schemas";

const SESSION_ID = "e2e-pointing-session";
const ROUNDS = 10;

/** 十条各不相同的指令卡：凑满 10 轮，且能验证“一轮一题、不重复”。 */
const PROMPTS = [
  "指一个你觉得今晚最有梗的人。",
  "指一个你第一眼就想认识的人。",
  "指一个最会照顾别人情绪的人。",
  "指一个你愿意和对方一起去旅行的人。",
  "指一个你觉得藏着最多故事的人。",
  "指一个你今晚最想多聊两句的人。",
  "指一个你觉得最会保守秘密的人。",
  "指一个你最想和对方交换一天生活的人。",
  "指一个你觉得今晚变化最大的人。",
  "指一个你觉得下次还会约出来的人。",
];

function pointingSession(): GameSession {
  const now = new Date().toISOString();
  const players = ["Alex", "Emma", "Kai", "Mia", "Leo", "Zoe"].map((displayName, index) => ({ id: `p${index + 1}`, displayName, active: true, createdAt: now, lastUsedAt: now }));
  const deckSnapshot: GameCard[] = PROMPTS.map((content, index) => ({
    id: `seed-pointing-game-${index + 1}`, packId: "pointing-game", type: "pointing", content,
    instruction: "倒数三秒，一起指向那个人", intensity: 2 as Intensity, tags: [], boundaryTags: [],
    minPlayers: 3, participantMode: "all", source: "builtin",
  }));
  return {
    schemaVersion: 2, id: SESSION_ID, status: "active", mode: "single",
    config: {
      players, relationship: "friends", vibes: ["funny"], intensity: 5 as Intensity,
      boundaries: { noPhysicalContact: false, noAlcoholPenalty: true, noExPartners: false, noSexualHistory: false, noMoneyIncome: false, noPhonePrivacy: true, noPublicPosting: true, noStrangerContact: true, noPhotoVideo: false, noSocialAccounts: false, customText: "" },
      enabledPackIds: ["pointing-game"], mode: "single",
    },
    deckSnapshot, usedCardIds: [], rounds: [],
    currentPackId: "pointing-game", currentSegmentId: "e2e-segment", currentPackState: {}, recentRejectedFingerprints: [],
    startedAt: now, updatedAt: now,
  };
}

const card = (page: Page) => page.locator(".pointing-game");
const ready = (page: Page) => page.getByRole("button", { name: "准备好了" });

async function openSession(page: Page) {
  await seedSession(page, pointingSession());
  await page.goto(`/game?session=${SESSION_ID}`);
  await expect(card(page)).toBeVisible();
}

/** 不依赖动画时长：直接跳过倒数进入「指」。 */
async function pointFast(page: Page) {
  await ready(page).click();
  await page.getByRole("button", { name: /跳过倒数/ }).click();
  await expect(page.getByLabel("一起指")).toBeVisible();
}

test("10 轮指人游戏：指令卡 + 3/2/1 + 指，不输入票数也能一路走完", async ({ page }) => {
  await openSession(page);
  const seen: string[] = [];

  for (let round = 1; round <= ROUNDS; round += 1) {
    await expect(card(page)).toBeVisible();
    expect(await card(page).getAttribute("data-phase")).toBe("ready");
    seen.push((await page.locator(".pointing-game h1").textContent()) ?? "");
    // 不强制统计票数：视图里没有任何逐人录入控件
    await expect(page.locator(".pointing-game input, .pointing-game textarea, .pointing-game select")).toHaveCount(0);

    await pointFast(page);
    await expect(page.getByRole("status", { name: "一起指" })).toContainText("指！");
    await page.getByRole("button", { name: "下一题" }).click();
    if (round < ROUNDS) await expect(page.getByText(`第 ${round + 1} / ${ROUNDS} 轮`)).toBeVisible();
  }

  // B8/D8：牌堆见底可能直接结算，也可能进Host双选（时序）；双选出现就点结束本局。
  const finish = page.getByRole("button", { name: "结束本局" });
  await Promise.race([
    page.waitForURL(new RegExp(`/summary\\?session=${SESSION_ID}`), { timeout: 15000 }).catch(() => undefined),
    finish.waitFor({ state: "visible", timeout: 15000 }).catch(() => undefined),
  ]);
  if (await finish.isVisible().catch(() => false)) {
    await finish.click();
  }

  await expect(page).toHaveURL(new RegExp(`/summary\\?session=${SESSION_ID}`), { timeout: 15000 });
  expect(new Set(seen).size).toBe(ROUNDS);

  const stored = await readSession(page, SESSION_ID);
  expect(stored.rounds).toHaveLength(ROUNDS);
  expect(stored.rounds.every((round) => round.packId === "pointing-game")).toBe(true);
  expect(stored.rounds.every((round) => round.status === "completed")).toBe(true);
  expect(stored.config.intensity).toBe(5);
});

test("倒计时按 3 → 2 → 1 走完，并自动落到「指」", async ({ page }) => {
  await openSession(page);
  await ready(page).click();

  await expect(page.getByLabel("倒数 3 秒")).toBeVisible();
  await expect(page.getByLabel("倒数 2 秒")).toBeVisible();
  await expect(page.getByLabel("倒数 1 秒")).toBeVisible();
  await expect(page.getByLabel("一起指")).toBeVisible();
  await expect(page.locator(".pointing-game__count")).toHaveCount(0);
});

test("倒计时可以快速跳过，不等它走完", async ({ page }) => {
  await openSession(page);
  await ready(page).click();
  await page.getByRole("button", { name: /跳过倒数/ }).click();

  await expect(page.getByLabel("一起指")).toBeVisible();
  await expect(page.getByRole("button", { name: /跳过倒数/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "下一题" })).toBeVisible();
});

test("reduced-motion 下不逐秒等待，直接给「指」", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openSession(page);
  await ready(page).click();

  await expect(page.getByLabel("一起指")).toBeVisible();
  await expect(page.locator(".pointing-game__count")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "下一题" })).toBeVisible();
});

test("换一个＝拒绝当前题面，记录 swapped 并换出不同指令", async ({ page }) => {
  await openSession(page);
  const before = await page.locator(".pointing-game h1").textContent();

  await pointFast(page);
  await page.getByRole("button", { name: "换一个" }).click();

  await expect(card(page)).toBeVisible();
  await expect.poll(() => page.locator(".pointing-game h1").textContent()).not.toBe(before);
  const stored = await readSession(page, SESSION_ID);
  expect(stored.rounds.map((round) => round.status)).toEqual(["swapped"]);
});

test("从主局切换玩法进入指人游戏，渲染指人视图而不是通用题卡", async ({ page }) => {
  await startLocalGame(page);

  await page.getByRole("button", { name: /切换玩法/ }).click();
  await page.getByRole("dialog", { name: "切换玩法" }).getByRole("button", { name: /指人游戏/ }).click();

  await expect(card(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "准备好了" })).toBeVisible();
  await expect(page.locator(".game-card--pointing-game")).toHaveCount(1);
});
