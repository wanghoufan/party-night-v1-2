import { expect, test } from "@playwright/test";

test("无账号完成组局并进入生成状态", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("登录")).toHaveCount(0);
  await page.getByRole("link", { name: /今晚开局/ }).click();
  await page.getByLabel("增加玩家").click();
  await page.getByRole("button", { name: "情侣 / 暧昧" }).click();
  await page.getByRole("button", { name: "暧昧", exact: true }).click();
  await page.getByRole("button", { name: /下一步：雷区设置/ }).click();
  await page.getByLabel("禁用身体接触").check();
  await page.getByRole("button", { name: /下一步：生成游戏/ }).click();
  await expect(page).toHaveURL(/\/generating\?session=/);
  await expect(page.getByRole("button", { name: /使用本地题库开始/ })).toBeVisible();
});

test("组局与雷区页面保留主导航且不遮挡下一步", async ({ page }) => {
  await page.goto("/setup");
  const navigation = page.getByRole("navigation", { name: "主导航" });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link", { name: "组局" })).toHaveAttribute("aria-current", "page");
  const setupButton = page.getByRole("button", { name: /下一步：雷区设置/ });
  await setupButton.scrollIntoViewIfNeeded();
  const setupButtonBox = await setupButton.boundingBox();
  const setupNavigationBox = await navigation.boundingBox();
  expect(setupButtonBox!.y + setupButtonBox!.height).toBeLessThanOrEqual(setupNavigationBox!.y);

  await setupButton.click();
  await expect(page).toHaveURL(/\/boundaries/);
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole("link", { name: "组局" })).toHaveAttribute("aria-current", "page");
  const boundaryButton = page.getByRole("button", { name: /下一步：生成游戏/ });
  await boundaryButton.scrollIntoViewIfNeeded();
  const boundaryButtonBox = await boundaryButton.boundingBox();
  const boundaryNavigationBox = await navigation.boundingBox();
  expect(boundaryButtonBox!.y + boundaryButtonBox!.height).toBeLessThanOrEqual(boundaryNavigationBox!.y);
});
