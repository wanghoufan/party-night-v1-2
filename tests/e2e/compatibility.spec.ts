import { expect, test, type Page } from "@playwright/test";
import { readSession, seedSession } from "./helpers";
import type { GameCard, GameSession, Intensity } from "@/lib/domain/schemas";

const SESSION_ID = "e2e-compatibility-session";
const ROUNDS = 5;

/** 五道各不相同的默契题：凑满 5 轮，且能验证“一轮一题、不重复”。 */
const PROMPTS = [
  "我们第一次见面时，对方穿的是什么颜色？",
  "对方最讨厌的食物是什么？",
  "对方周末更想做的事：赖床还是出门？",
  "对方遇到压力时，更需要陪伴还是需要空间？",
  "对方最近一次开怀大笑是因为什么？",
];

function compatibilitySession(): GameSession {
  const now = new Date().toISOString();
  const players = ["Alex", "Emma", "Kai", "Mia"].map((displayName, index) => ({ id: `p${index + 1}`, displayName, active: true, createdAt: now, lastUsedAt: now }));
  const deckSnapshot: GameCard[] = PROMPTS.map((content, index) => ({
    id: `seed-compatibility-test-${index + 1}`, packId: "compatibility-test", type: "compatibility", content,
    instruction: "两人同时回答，看是否一样", intensity: 1 as Intensity, tags: [], boundaryTags: [],
    minPlayers: 2, participantMode: "pair", source: "builtin",
  }));
  return {
    schemaVersion: 2, id: SESSION_ID, status: "active", mode: "single",
    config: {
      players, relationship: "friends", vibes: ["funny"], intensity: 3 as Intensity,
      boundaries: { noPhysicalContact: false, noAlcoholPenalty: true, noExPartners: false, noSexualHistory: false, noMoneyIncome: false, noPhonePrivacy: true, noPublicPosting: true, noStrangerContact: true, noPhotoVideo: false, noSocialAccounts: false, customText: "" },
      enabledPackIds: ["compatibility-test"], mode: "single",
    },
    deckSnapshot, usedCardIds: [], rounds: [],
    currentPackId: "compatibility-test", currentPackState: {}, recentRejectedFingerprints: [],
    startedAt: now, updatedAt: now,
  };
}

const view = (page: Page) => page.locator(".compatibility-game");
const same = (page: Page) => page.getByRole("button", { name: "一样 ❤️" });
const different = (page: Page) => page.getByRole("button", { name: "不一样 😂" });
const score = (page: Page) => page.locator(".compat-game__score");

async function openSession(page: Page) {
  await seedSession(page, compatibilitySession());
  await page.goto(`/game?session=${SESSION_ID}`);
  await expect(view(page)).toBeVisible();
}

test("默契测试：配对 → 5 题（一样/不一样混判）→ 刷新 → 分数与配对恢复 → 继续", async ({ page }) => {
  await openSession(page);
  // 默认配对取在场前两人：Alex × Emma，起始 0/0
  await expect(page.getByText(/Alex × Emma/)).toBeVisible();
  await expect(score(page)).toHaveText("默契 0/0");
  // 单机同桌口头回答：视图内没有任何逐人秘密输入
  await expect(view(page).locator("input, textarea, select")).toHaveCount(0);

  // 5 题：一样、不一样、一样、一样、不一样 → 分数 3/5
  const answers = ["same", "different", "same", "same", "different"] as const;
  const seen: string[] = [];
  for (let round = 0; round < ROUNDS; round += 1) {
    await expect(view(page)).toBeVisible();
    seen.push((await page.locator(".compatibility-game h1").textContent()) ?? "");
    await (answers[round] === "same" ? same(page) : different(page)).click();
    if (round < ROUNDS - 1) {
      await page.getByRole("button", { name: "下一题" }).click();
      await expect(page.getByText(`第 ${round + 2} / ${ROUNDS} 轮`)).toBeVisible();
    }
  }

  await expect(score(page)).toHaveText("默契 3/5");
  expect(new Set(seen).size).toBe(ROUNDS);

  const before = await readSession(page, SESSION_ID);
  expect(before.currentPackState?.compatibility).toEqual({ playerAId: "p1", playerBId: "p2", score: 3, rounds: 5 });

  // 刷新：分数、配对、题目一起恢复
  await page.reload();
  await expect(view(page)).toBeVisible();
  await expect(page.getByText(/Alex × Emma/)).toBeVisible();
  await expect(score(page)).toHaveText("默契 3/5");
  const restored = await readSession(page, SESSION_ID);
  expect(restored.currentPackState?.compatibility).toEqual({ playerAId: "p1", playerBId: "p2", score: 3, rounds: 5 });

  // 继续：第 6 题判“一样” → 4/6
  await same(page).click();
  await expect(score(page)).toHaveText("默契 4/6");
  const continued = await readSession(page, SESSION_ID);
  expect(continued.currentPackState?.compatibility).toEqual({ playerAId: "p1", playerBId: "p2", score: 4, rounds: 6 });
});

test("默契测试：换 pair 后分数与题数从 0 重计，刷新仍用新配对", async ({ page }) => {
  await openSession(page);
  await expect(score(page)).toHaveText("默契 0/0");

  await same(page).click();
  await next(page, 2);
  await same(page).click();
  await next(page, 3);
  await expect(score(page)).toHaveText("默契 2/2");

  // 换成 Kai（p3）：pair 变 Emma × Kai，分数/题数归零
  await page.getByRole("button", { name: "Kai" }).click();
  await expect(page.getByText(/Emma × Kai/)).toBeVisible();
  await expect(score(page)).toHaveText("默契 0/0");

  await page.reload();
  await expect(page.getByText(/Emma × Kai/)).toBeVisible();
  await expect(score(page)).toHaveText("默契 0/0");
  const stored = await readSession(page, SESSION_ID);
  expect(stored.currentPackState?.compatibility).toEqual({ playerAId: "p2", playerBId: "p3", score: 0, rounds: 0 });
});

test("默契测试：不一样不加分，只累加题数；换一个记 swapped", async ({ page }) => {
  await openSession(page);

  await different(page).click();
  await expect(score(page)).toHaveText("默契 0/1");
  await next(page, 2);

  await page.getByRole("button", { name: "换一个" }).click();
  await expect(view(page)).toBeVisible();
  await expect.poll(() => readSession(page, SESSION_ID).then((s) => s.rounds.length)).toBe(2);
  const stored = await readSession(page, SESSION_ID);
  expect(stored.rounds.map((round) => round.status)).toEqual(["completed", "swapped"]);
  expect(stored.currentPackState?.compatibility).toMatchObject({ score: 0, rounds: 1 });
});

async function next(page: Page, round: number) {
  await page.getByRole("button", { name: "下一题" }).click();
  await expect(view(page)).toBeVisible();
  await expect(page.getByText(`第 ${round} / 5 轮`)).toBeVisible();
}
