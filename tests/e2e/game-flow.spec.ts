import { expect, test } from "@playwright/test";
import { startLocalGame } from "./helpers";

test("本地整局可完成、换题、跳过并结束总结", async ({ page }) => {
  await startLocalGame(page);
  await page.getByRole("button", { name: "完成" }).click();
  await page.getByRole("button", { name: "换一个" }).click();
  // V1.5：顶栏只数已完成轮次——完成推进到第 2，换一个/跳过都不再前进
  await page.getByRole("button", { name: "跳过" }).click();
  await expect(page.getByText(/第 2 \/ /)).toBeVisible();
  await page.getByLabel("打开局中设置").click();
  await page.getByRole("button", { name: "结束本局" }).click();
  await expect(page).toHaveURL(/\/summary/);
  await expect(page.getByRole("heading", { name: "今晚游戏结束！" })).toBeVisible();
  await expect(page.getByText("3", { exact: true }).first()).toBeVisible();
});

test("Deck 生成后离线与刷新均可继续", async ({ page, context }) => {
  await startLocalGame(page);
  const first = await page.locator(".game-card h1").textContent();
  await context.setOffline(true);
  await page.getByRole("button", { name: "完成" }).click();
  await expect(page.locator(".game-card h1")).not.toHaveText(first ?? "");
  await context.setOffline(false);
  await page.reload();
  await expect(page.locator(".game-card")).toBeVisible();
});
