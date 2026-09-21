import { expect, test, type Page } from "@playwright/test";
import { currentSessionId, readSession, startPackGame } from "./helpers";

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

test("刷新后仍停在没有题卡的玩法上，不白屏", async ({ page }) => {
  await startPackGame(page, /我从来没有/);
  const id = currentSessionId(page);

  await switchEntry(page).click();
  await page.getByRole("dialog", { name: "切换玩法" }).getByRole("button", { name: /转瓶子/ }).click();
  await expect(page.getByRole("heading", { name: /暂时没有可玩的题卡/ })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("heading", { name: /暂时没有可玩的题卡/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /切换玩法/ })).toBeVisible();
  expect((await readSession(page, id)).currentPackId).toBe("spin-bottle");
});
