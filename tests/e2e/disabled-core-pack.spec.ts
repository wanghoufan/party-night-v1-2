import { expect, test } from "@playwright/test";
import { countSessions } from "./helpers";

/**
 * 禁用首页核心 pack（T199 / FR-044 / SC-014）：
 * 游戏包禁用内置玩法 → 首页卡仍在原位但显示禁用态 → 点击只引导去游戏包、不直接开局 → 可原地重新启用。
 */
test("禁用核心玩法后首页卡保留禁用态、点击不绕过、游戏包可重新启用", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: /随机玩一个/ })).toBeVisible();

  // 在“游戏包”里禁用这个内置玩法（内置玩法与自定义玩法一样有启用开关）
  await page.goto("/packs");
  const toggle = page.getByLabel("启用随机玩一个");
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();

  // 刷新后禁用状态仍在（本地持久化）
  await page.reload();
  await expect(page.getByLabel("启用随机玩一个")).not.toBeChecked();

  // 首页：卡片保留位置，但已是禁用态且不再是开局入口
  await page.goto("/");
  const disabled = page.getByRole("button", { name: /随机玩一个/ });
  await expect(disabled).toBeVisible();
  await expect(disabled).toHaveText(/已在游戏包禁用/);
  await expect(page.getByRole("link", { name: /随机玩一个/ })).toHaveCount(0);

  // 点禁用卡只引导去游戏包，不新建 Session、不绕过禁用开局
  await disabled.click();
  await expect(page).toHaveURL(/\/packs$/);
  await expect(page.getByRole("heading", { name: "我的游戏包" })).toBeVisible();
  expect(await countSessions(page)).toBe(0);

  // 重新启用后恢复成正常开局入口：先等禁用态在库里落定且 UI 稳定在未选中，再点
  await expect.poll(() => page.evaluate(() => new Promise<string[]>((resolve, reject) => {
    const request = indexedDB.open("party-night-v1");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      try {
        const db = request.result;
        const result = db.transaction("preferences").objectStore("preferences").get("main");
        result.onsuccess = () => { db.close(); resolve((result.result as { disabledPackIds?: string[] } | undefined)?.disabledPackIds ?? []); };
        result.onerror = () => { db.close(); reject(result.error); };
      } catch (error) { reject(error); }
    };
  })), { timeout: 10000 }).toContain("ai-improv");
  await expect(page.getByLabel("启用随机玩一个")).not.toBeChecked();
  // 受控异步 Toggle：check() 会读点击瞬间的旧 DOM 误判，改用 click + 重试断言
  await page.getByLabel("启用随机玩一个").click();
  await expect(page.getByLabel("启用随机玩一个")).toBeChecked();
  await page.goto("/");
  await expect(page.getByRole("link", { name: /随机玩一个/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /随机玩一个/ })).toHaveCount(0);
});

test("禁用核心玩法后它也不再出现在主局切换面板里", async ({ page }) => {
  await page.goto("/packs");
  // 受控异步 Toggle：uncheck() 会读旧 DOM 误判，改用 click + 重试断言
  await page.getByLabel("启用谁最可能").click();
  await expect(page.getByLabel("启用谁最可能")).not.toBeChecked();

  await page.goto("/");
  await page.getByRole("link", { name: /我从来没有/ }).click();
  await page.getByRole("button", { name: /下一步：雷区设置/ }).click();
  await page.getByRole("button", { name: /下一步：生成游戏/ }).click();
  await page.getByRole("button", { name: /使用本地题库开始/ }).click();
  await expect(page.locator(".game-card")).toBeVisible();

  await page.getByRole("button", { name: /切换玩法/ }).click();
  const sheet = page.getByRole("dialog", { name: "切换玩法" });
  await expect(sheet.getByRole("button", { name: /我从来没有/ })).toBeVisible();
  await expect(sheet.getByRole("button", { name: /谁最可能/ })).toHaveCount(0);
});
