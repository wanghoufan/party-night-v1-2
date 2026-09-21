import { expect, test, type Page } from "@playwright/test";
import { countSessions } from "./helpers";

/**
 * V1.4 R-050/R-053/R-054/R-055/R-056/R-057：首页重排 + 开关口径。
 * - 首页 7 个真实玩法 + 动作卡「随机玩一个」全部直出；「更多玩法 / 我的游戏包 / AI 模型设置」三条首页入口已删。
 * - 游戏包开关的语义是「关闭则不加入 AI 组局」：只圈混合候选，首页单玩与主局 switcher 不受影响。
 * - 至少保留一个：关掉最后一个玩法被拒绝，开关保持开启并给可见提示。
 */

const REAL_PACKS = [/真心话大冒险/, /谁最可能/, /我从来没有/, /二选一/, /指人游戏/, /默契测试/, /转瓶子/];

async function disablePack(page: Page, name: string) {
  await page.goto("/packs");
  await page.getByLabel(`启用${name}`).click();
  await expect(page.getByLabel(`启用${name}`)).not.toBeChecked();
}

test("首页直出 7 个玩法 + 随机玩一个，三项快捷入口消失、底部仍是 4 个 Tab", async ({ page }) => {
  await page.goto("/");

  const grid = page.getByRole("region", { name: "玩法" });
  await expect(grid.getByRole("link")).toHaveCount(8);
  for (const name of [...REAL_PACKS, /随机玩一个/]) await expect(grid.getByRole("link", { name })).toBeVisible();

  // R-053：三个首页入口都不再出现（目标页与能力仍在）
  await expect(page.getByRole("button", { name: /更多玩法/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /我的游戏包/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /AI 模型设置/ })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("更多玩法")).toHaveCount(0);

  const navigation = page.getByRole("navigation", { name: "主导航" });
  await expect(navigation.getByRole("link")).toHaveCount(4);
  await navigation.getByRole("link", { name: "游戏包" }).click();
  await expect(page.getByRole("heading", { name: "我的游戏包" })).toBeVisible();
  await page.goBack();
  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "设置" }).click();
  await expect(page.getByRole("heading", { name: "AI 模型设置" })).toBeVisible();
});

test("快捷工具在首页独立分区里就地可用，不再包在“更多玩法”面板里", async ({ page }) => {
  await page.goto("/");

  const tools = page.getByRole("region", { name: "快捷工具" });
  await expect(tools.getByRole("button", { name: /随机点名/ })).toBeVisible();
  await expect(tools.getByRole("button", { name: /随机分组/ })).toBeVisible();

  await tools.getByRole("button", { name: /随机点名/ }).click();
  const dialog = page.getByRole("dialog", { name: "快捷工具" });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("随机点名")).toContainText("还没有在场玩家");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("游戏包开关只圈 AI 组局：关掉后首页单玩与主局切换照样能选到它", async ({ page }) => {
  await disablePack(page, "谁最可能");

  // 首页单玩不受限：卡片照旧是开局入口
  await page.goto("/");
  await page.getByRole("link", { name: /我从来没有/ }).click();
  await expect(page).toHaveURL(/\/setup\?pack=never-have/);

  // 主局 switcher 也不受开关限制
  await page.getByRole("button", { name: /下一步：雷区设置/ }).click();
  await page.getByRole("button", { name: /下一步：生成游戏/ }).click();
  await page.getByRole("button", { name: /使用本地题库开始/ }).click();
  await expect(page.locator(".game-card")).toBeVisible();

  await page.getByRole("button", { name: /切换玩法/ }).click();
  const sheet = page.getByRole("dialog", { name: "切换玩法" });
  await sheet.getByRole("button", { name: /谁最可能/ }).click();
  await expect(page.getByRole("dialog", { name: "切换玩法" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /切换玩法 · 谁最可能/ })).toBeVisible();
});

test("内置开关带“关闭则不加入 AI 组局”小字，关掉一个不会挡住它自己的单玩", async ({ page }) => {
  await page.goto("/packs");
  await expect(page.locator(".pack-list small").filter({ hasText: "关闭则不加入 AI 组局" })).toHaveCount(7);
  // 动作卡「随机玩一个」不是题卡玩法，不给开关
  await expect(page.getByLabel("启用随机玩一个")).toHaveCount(0);
  await page.getByLabel("启用我从来没有").click();
  await expect(page.getByLabel("启用我从来没有")).not.toBeChecked();
  await page.reload();
  await expect(page.getByLabel("启用我从来没有")).not.toBeChecked();
  await page.goto("/");
  await expect(page.getByRole("link", { name: /我从来没有/ })).toBeVisible();
});

test("至少保留一个玩法：关掉最后一个被拒绝、开关保持开启、有可见提示", async ({ page }) => {
  const names = ["真心话大冒险", "谁最可能", "我从来没有", "二选一", "指人游戏", "默契测试"];
  for (const name of names) await disablePack(page, name);

  await page.goto("/packs");
  await page.getByLabel("启用转瓶子").click();

  await expect(page.locator(".pack-notice")).toContainText("至少保留一个玩法");
  await expect(page.getByLabel("启用转瓶子")).toBeChecked();
  await page.reload();
  await expect(page.getByLabel("启用转瓶子")).toBeChecked();
  expect(await countSessions(page)).toBe(0);
});

test("setup 显示最终 mixed 候选 N（含自定义玩法）", async ({ page }) => {
  // 先在游戏包里关掉一个内置玩法：N 应当跟着 AI 组局候选走
  await disablePack(page, "转瓶子");

  await page.goto("/packs/new");
  await page.getByLabel("名称").fill("本局自定义");
  await page.getByRole("button", { name: /添加题卡/ }).click();
  await page.getByPlaceholder("输入题目内容").last().fill("说出今晚谁最会整活");
  await page.getByRole("button", { name: "保存游戏包" }).click();
  await expect(page.getByRole("heading", { name: "我的游戏包" })).toBeVisible();

  await page.goto("/setup");
  // 7 个内置真实玩法 - 1 个被关闭 + 1 个自定义
  await expect(page.locator(".setup-mixed-count")).toHaveText("本局 AI 组局候选：7 个玩法（含自定义 1 个）");
});
