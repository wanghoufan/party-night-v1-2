import { expect, test } from "@playwright/test";
import { startLocalGame } from "./helpers";

test("没有进行中的局时，历史偏好允许单模式直接开始", async ({ page }) => {
  await startLocalGame(page);
  await page.getByRole("button", { name: "完成" }).click();
  await page.getByLabel("打开局中设置").click();
  await page.getByRole("button", { name: "结束本局" }).click();
  await expect(page).toHaveURL(/\/summary/);

  await page.goto("/");
  await expect(page.getByText("继续上一局")).toBeHidden();
  await page.getByRole("link", { name: /谁最可能/ }).click();
  await expect(page).toHaveURL(/\/setup\?pack=most-likely/);
  await expect(page.getByText("沿用上次设置")).toBeVisible();
  await page.getByRole("button", { name: "直接开始" }).click();
  await expect(page).toHaveURL(/\/generating/);
});
