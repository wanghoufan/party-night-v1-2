import { expect, test } from "@playwright/test";

test("首页可访问", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Party Night/);
  await expect(page.getByRole("link", { name: /今晚开局/ })).toBeVisible();
});
