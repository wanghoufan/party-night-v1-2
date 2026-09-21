import { expect, test } from "@playwright/test";
import { startLocalGame } from "./helpers";

test("刷新恢复并动态暂离玩家", async ({ page }) => {
  await startLocalGame(page);
  await page.getByRole("button", { name: "完成" }).click();
  await page.reload();
  await expect(page.locator(".game-card")).toBeVisible();
  await page.getByLabel("打开局中设置").click();
  await page.locator(".player-manager .toggle").first().click();
  await expect(page.locator(".player-manager input[type=checkbox]").first()).not.toBeChecked();
  await page.getByRole("button", { name: "暂停本局" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("本局已暂停")).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("继续上一局")).toBeVisible();
});
