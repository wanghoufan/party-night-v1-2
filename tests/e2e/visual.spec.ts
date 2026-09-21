import { expect, test } from "@playwright/test";

test("生成 7 类核心页面视觉检查截图", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.screenshot({ path: "test-results/visual/01-home-390.png", fullPage: true });
  await page.getByRole("link", { name: /今晚开局/ }).click();
  await expect(page).toHaveURL(/\/setup/);
  await page.screenshot({ path: "test-results/visual/02-setup-390.png", fullPage: true });
  await page.getByRole("button", { name: /下一步：雷区设置/ }).click();
  await expect(page).toHaveURL(/\/boundaries/);
  await page.screenshot({ path: "test-results/visual/03-boundaries-390.png", fullPage: true });
  await page.getByRole("button", { name: /下一步：生成游戏/ }).click();
  await expect(page).toHaveURL(/\/generating/);
  await expect(page.getByRole("button", { name: /使用本地题库开始/ })).toBeVisible();
  await page.screenshot({ path: "test-results/visual/04-generating-390.png", fullPage: true });
  await page.getByRole("button", { name: /使用本地题库开始/ }).click();
  await expect(page).toHaveURL(/\/game/);
  await expect(page.locator(".game-card")).toBeVisible();
  await page.screenshot({ path: "test-results/visual/05-game-390.png", fullPage: true });
  await page.getByRole("button", { name: "完成" }).click();
  await page.getByRole("button", { name: "换一个" }).click();
  await page.getByRole("button", { name: "跳过" }).click();
  await page.getByLabel("打开局中设置").click();
  await page.getByRole("button", { name: "结束本局" }).click();
  await expect(page).toHaveURL(/\/summary/);
  await expect(page.getByRole("heading", { name: /今晚游戏结束/ })).toBeVisible();
  await page.screenshot({ path: "test-results/visual/06-summary-390.png", fullPage: true });
  await page.goto("/settings/ai");
  await page.getByRole("textbox", { name: "API Key", exact: true }).fill("sk-visual-check-not-real-123456");
  await page.getByRole("button", { name: "保存配置" }).click();
  await page.screenshot({ path: "test-results/visual/07-ai-settings-390.png", fullPage: true });
  await page.getByRole("button", { name: /清空 API 密钥/ }).click();
  await page.screenshot({ path: "test-results/visual/08-danger-modal-390.png", fullPage: true });
});

test("首页适配 360 与 430 宽度", async ({ page }) => {
  for (const width of [360, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("link", { name: /今晚开局/ })).toBeVisible();
    await page.screenshot({ path: `test-results/visual/home-${width}.png`, fullPage: true });
  }
});
