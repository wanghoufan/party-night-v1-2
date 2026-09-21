import { expect, test, type Page } from "@playwright/test";
import { seedSession } from "./helpers";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import type { GameSession, Intensity } from "@/lib/domain/schemas";

const SESSION_ID = "e2e-party-tools-session";

/** 工具复用当前 Session 玩家名单：这里落一局 4 人、无 AI 依赖的本地局。 */
function toolsSession(): GameSession {
  const now = new Date().toISOString();
  const players = ["Alex", "Emma", "Kai", "Mia"].map((displayName, index) => ({ id: `p${index + 1}`, displayName, active: true, createdAt: now, lastUsedAt: now }));
  return {
    schemaVersion: 2, id: SESSION_ID, status: "active", mode: "single",
    config: {
      players, relationship: "friends", vibes: ["funny"], intensity: 3 as Intensity,
      boundaries: { noPhysicalContact: false, noAlcoholPenalty: true, noExPartners: false, noSexualHistory: false, noMoneyIncome: false, noPhonePrivacy: true, noPublicPosting: true, noStrangerContact: true, noPhotoVideo: false, noSocialAccounts: false, customText: "" },
      enabledPackIds: ["never-have"], mode: "single",
    },
    deckSnapshot: BUILTIN_SEED_CARDS.filter((card) => card.packId === "never-have"),
    usedCardIds: [], rounds: [], currentPackId: "never-have", currentPackState: {}, recentRejectedFingerprints: [],
    startedAt: now, updatedAt: now,
  };
}

const sheet = (page: Page) => page.getByRole("dialog", { name: "更多玩法" });

async function openSheetWithSession(page: Page) {
  await seedSession(page, toolsSession());
  await page.goto("/");
  await page.getByRole("button", { name: /更多玩法/ }).click();
  await expect(sheet(page)).toBeVisible();
}

test("更多玩法面板：4 个新玩法 + 2 个快捷工具，底部仍是原来的 4 个 Tab（T159/T161）", async ({ page }) => {
  await openSheetWithSession(page);

  expect(await page.getByRole("navigation", { name: "主导航" }).getByRole("link").count()).toBe(4);
  for (const name of [/二选一/, /指人游戏/, /默契测试/, /转瓶子/, /随机点名/, /随机分组/]) {
    await expect(sheet(page).getByRole("button", { name })).toBeVisible();
  }
  // 核心 4 玩法不重复出现在这里
  await expect(sheet(page).getByRole("button", { name: /真心话大冒险/ })).toHaveCount(0);
});

test("随机点名：复用本局玩家名单，再抽一个不点同一人（T158 / FR-022）", async ({ page }) => {
  await openSheetWithSession(page);
  await sheet(page).getByRole("button", { name: /随机点名/ }).click();

  const tool = page.getByLabel("随机点名");
  await expect(tool).toContainText("4 位在场玩家");
  await expect(tool).toContainText("纯本地随机 · 不联网");

  await tool.getByRole("button", { name: "随机点名" }).click();
  const first = (await tool.getByRole("status").textContent()) ?? "";
  expect(["Alex", "Emma", "Kai", "Mia"]).toContain(first);

  await tool.getByRole("button", { name: "再抽一个" }).click();
  await expect(tool.getByRole("status")).not.toHaveText(first);
});

test("随机分组：默认 2 组、可切两人一组，人数差最多 1（T158 / FR-023）", async ({ page }) => {
  await openSheetWithSession(page);
  await sheet(page).getByRole("button", { name: /随机分组/ }).click();

  const tool = page.getByLabel("随机分组");
  await tool.getByRole("button", { name: "开始分组" }).click();
  await expect(tool.getByRole("listitem")).toHaveCount(2);
  await expect(tool.getByRole("listitem").nth(0)).toContainText("2 人");
  await expect(tool.getByRole("listitem").nth(1)).toContainText("2 人");

  await tool.getByRole("button", { name: "两人一组" }).click();
  await tool.getByRole("button", { name: /重新分组/ }).click();
  await expect(tool.getByRole("listitem")).toHaveCount(2);

  // 关掉再打开回到玩法列表，工具页不残留
  await page.getByRole("button", { name: "返回玩法列表" }).click();
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toHaveCount(0);
});
