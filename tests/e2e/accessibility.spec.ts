import { expect, test, type Locator } from "@playwright/test";
import { startLocalGame } from "./helpers";

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "控件应在当前视口可见").not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

test("核心操作具有语义、焦点样式与移动端触控面积", async ({ page }) => {
  await page.goto("/");
  const start = page.getByRole("link", { name: /今晚开局/ });
  await expectTouchTarget(start);
  await start.focus();
  await expect(start).toBeFocused();
  await expect(start).toHaveCSS("outline-style", "solid");
  for (const name of ["真心话大冒险", "谁最可能", "我从来没有", "随机玩一个"]) await expectTouchTarget(page.getByRole("link", { name: new RegExp(name) }));

  await page.goto("/settings/ai");
  await expect(page.getByRole("textbox", { name: "API Key", exact: true })).toHaveAttribute("type", "password");
  await expectTouchTarget(page.getByRole("button", { name: "显示 API Key" }));
  await expectTouchTarget(page.getByRole("button", { name: "保存配置" }));
});

test("减少动画偏好会将卡片动画降至近乎即时", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startLocalGame(page);
  const duration = await page.locator(".game-card").evaluate((node) => getComputedStyle(node).animationDuration);
  expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.001);
});

test("浅色模式下深色游戏卡题目保持高对比度", async ({ page }) => {
  await page.goto("/settings/ai");
  await page.getByRole("button", { name: "浅色" }).click();
  await startLocalGame(page);
  await expect(page.locator(".game-card h1")).toHaveCSS("color", "rgb(255, 255, 255)");
});
