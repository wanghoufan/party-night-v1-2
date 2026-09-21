import { expect, test, type Page } from "@playwright/test";
import { currentSessionId, readSession, seedSession, startPackGame } from "./helpers";
import type { GameSession } from "@/lib/domain/schemas";

const switchEntry = (page: Page) => page.getByRole("button", { name: /切换玩法/ });

test("刷新后恢复切换过的当前玩法与同一张题卡", async ({ page }) => {
  await startPackGame(page, /我从来没有/);
  const id = currentSessionId(page);

  await switchEntry(page).click();
  await page.getByRole("dialog", { name: "切换玩法" }).getByRole("button", { name: /二选一/ }).click();
  await expect(switchEntry(page)).toContainText("二选一");
  const dealt = await page.locator(".would-you-rather").getAttribute("data-card-id");

  await page.reload();

  await expect(switchEntry(page)).toContainText("二选一");
  await expect(page.locator(".would-you-rather")).toHaveAttribute("data-card-id", dealt ?? "");
  const restored = await readSession(page, id);
  expect(restored.currentPackId).toBe("would-you-rather");
  expect(restored.currentRound?.packId).toBe("would-you-rather");
});

test("刷新后仍停在转瓶子（纯本地玩法没有题卡），不白屏", async ({ page }) => {
  await startPackGame(page, /我从来没有/);
  const id = currentSessionId(page);

  await switchEntry(page).click();
  await page.getByRole("dialog", { name: "切换玩法" }).getByRole("button", { name: /转瓶子/ }).click();
  await expect(page.locator(".spin-bottle")).toBeVisible();

  await page.reload();

  await expect(page.locator(".spin-bottle")).toBeVisible();
  await expect(page.getByRole("button", { name: "开始旋转" })).toBeVisible();
  await expect(page.getByRole("button", { name: /切换玩法/ })).toBeVisible();
  expect((await readSession(page, id)).currentPackId).toBe("spin-bottle");
});

/** 题库一张可玩卡都不剩的玩法（例如被尺度/雷区过滤到 0 张）：空状态而不是白屏。 */
function emptyDeckSession(): GameSession {
  const now = new Date().toISOString();
  const players = ["Alex", "Emma"].map((displayName, index) => ({ id: `p${index + 1}`, displayName, active: true, createdAt: now, lastUsedAt: now }));
  return {
    schemaVersion: 2, id: "e2e-empty-deck-session", status: "active", mode: "single",
    config: {
      players, relationship: "friends", vibes: ["funny"], intensity: 1,
      boundaries: { noPhysicalContact: true, noAlcoholPenalty: true, noExPartners: true, noSexualHistory: true, noMoneyIncome: true, noPhonePrivacy: true, noPublicPosting: true, noStrangerContact: true, noPhotoVideo: true, noSocialAccounts: true, customText: "" },
      enabledPackIds: ["never-have"], mode: "single",
    },
    deckSnapshot: [], usedCardIds: [], rounds: [],
    currentPackId: "never-have", currentPackState: {}, recentRejectedFingerprints: [],
    startedAt: now, updatedAt: now,
  };
}

test("刷新后仍停在没有可玩题卡的玩法上，不白屏也不自动切玩法", async ({ page }) => {
  await seedSession(page, emptyDeckSession());
  await page.goto("/game?session=e2e-empty-deck-session");

  await expect(page.getByRole("heading", { name: /暂时没有可玩的题卡/ })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("heading", { name: /暂时没有可玩的题卡/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "返回首页" })).toBeVisible();
  expect((await readSession(page, "e2e-empty-deck-session")).currentPackId).toBe("never-have");
});
