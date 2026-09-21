import { expect, test } from "@playwright/test";
import { startLocalGame } from "./helpers";

test("历史偏好允许单模式直接开始", async ({ page }) => {
  await startLocalGame(page);
  await page.goto("/");
  await page.getByRole("link", { name: /谁最可能/ }).click();
  await expect(page.getByText("沿用上次设置")).toBeVisible();
  await page.getByRole("button", { name: "直接开始" }).click();
  await expect(page).toHaveURL(/\/generating/);
});
