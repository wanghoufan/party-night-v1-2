import { expect, test, type Page } from "@playwright/test";

/**
 * T166：自定义 Pack CRUD 回归。新增的“玩法 / 规则”二级切换只能改变分区展示，
 * 不许影响原有新建 / 编辑 / 启用禁用 / 删除链路，也不许把分区带进底部导航。
 */
const PACK = "回归梗包";

async function createPack(page: Page) {
  await page.goto("/packs");
  await page.getByRole("link", { name: "新建游戏包" }).click();
  await expect(page).toHaveURL(/\/packs\/new/);
  await page.getByLabel("名称").fill(PACK);
  await page.getByRole("button", { name: /添加题卡/ }).click();
  await page.getByPlaceholder("输入题目内容").last().fill("说出今晚最好笑的一件事");
  await page.getByRole("button", { name: /添加题卡/ }).click();
  await page.getByPlaceholder("输入题目内容").last().fill("给左边的人起个外号");
  await page.getByRole("button", { name: "保存游戏包" }).click();
  await expect(page).toHaveURL(/\/packs$/);
}

test("游戏包页新增分区后，自定义玩法的增改禁删仍然可用（T166）", async ({ page }) => {
  // 默认进玩法分区，底部导航仍是原来的 4 个 Tab
  await page.goto("/packs");
  await expect(page.getByRole("button", { name: "玩法" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("navigation", { name: "主导航" }).getByRole("link")).toHaveCount(4);

  await createPack(page);
  await expect(page.getByText(PACK)).toBeVisible();
  await expect(page.getByText("2 张题卡")).toBeVisible();

  // 编辑：改名 + 加卡后保存，列表跟着更新
  await page.getByRole("link", { name: new RegExp(PACK) }).click();
  await expect(page).toHaveURL(/\/packs\/editor\?id=custom-/);
  await page.getByLabel("名称").fill(`${PACK} v2`);
  await page.getByRole("button", { name: /添加题卡/ }).click();
  await page.getByPlaceholder("输入题目内容").last().fill("用一个词形容今晚");
  await page.getByRole("button", { name: "保存游戏包" }).click();
  await expect(page).toHaveURL(/\/packs$/);
  await expect(page.getByText(`${PACK} v2`)).toBeVisible();
  await expect(page.getByText("3 张题卡")).toBeVisible();

  // 二级切换来回一次，自定义玩法不受影响（新增 segment 的回归点）
  await page.getByRole("button", { name: "规则" }).click();
  await expect(page.getByRole("heading", { name: "内置玩法" })).toBeHidden();
  await page.getByRole("button", { name: "玩法" }).click();
  await expect(page.getByText(`${PACK} v2`)).toBeVisible();

  // 禁用 → 刷新后状态保持（启用状态是异步落库的，用断言等待而不是 uncheck 的即时校验）
  await page.getByLabel(`启用${PACK} v2`).click();
  await expect(page.getByLabel(`启用${PACK} v2`)).not.toBeChecked();
  await page.reload();
  await expect(page.getByLabel(`启用${PACK} v2`)).not.toBeChecked();

  // 删除 → 回到空状态
  await page.getByRole("button", { name: `删除${PACK} v2` }).click();
  await expect(page.getByText(`${PACK} v2`)).toBeHidden();
  await expect(page.getByRole("heading", { name: "保存你们自己的梗" })).toBeVisible();
});
