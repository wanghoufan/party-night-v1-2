import { expect, test, type Page } from "@playwright/test";

/**
 * P1（RC 前必修）：玩法准入按 **在场人数** 收口（AI-MATRIX-PLAN §1）。
 *
 * 回归的是这条真实死局：2 人局直选 pointing-game / most-likely（契约 minPlayers=3）
 * → 生成层按契约把卡标成 minPlayers=3 → safety-filter 以 playerCount=2 把卡全滤掉
 * → 本地 seed 也没有该玩法的 2 人可用卡 → deck=0 → 主局「可玩的题都出完了」只能洗牌空转。
 *
 * 修法：setup 层拦住（不进生成页，给改人数/换玩法的出口），够人时照常开局。
 */

const NEXT = /下一步：雷区设置/;
const stepButton = (page: Page) => page.getByRole("button", { name: NEXT });

async function shrinkTo(page: Page, count: number) {
  // 默认 6 人，减到目标人数（减少按钮的 aria-label 是「减少玩家」）。
  for (let current = 6; current > count; current -= 1) await page.getByLabel("减少玩家").click();
  await expect(page.locator(".stepper strong")).toContainText(String(count));
}

test("2 人局直选「指人游戏」（minPlayers=3）：当场提示至少 3 人，不进生成页", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /指人游戏/ }).click();
  await expect(page).toHaveURL(/\/setup\?pack=pointing-game/);

  // 默认 6 人够玩：没有任何拦截提示，下一步可用。
  await expect(page.locator(".setup-pack-notice")).toHaveCount(0);
  await expect(stepButton(page)).toBeEnabled();

  await shrinkTo(page, 2);

  const notice = page.locator(".setup-pack-notice");
  await expect(notice).toContainText("至少需要 3 人");
  await expect(notice).toContainText("当前在场 2 人");
  // 停在 setup：CTA 变灰、不跳雷区页、不跳生成页。
  await expect(stepButton(page)).toBeDisabled();
  await expect(page).toHaveURL(/\/setup\?pack=pointing-game/);
  await expect(page.getByRole("button", { name: /下一步：生成游戏/ })).toHaveCount(0);
  // 出口仍在：提示里给「返回首页换个玩法」，玩家页仍在可改人数。
  await expect(page.getByLabel("增加玩家")).toBeEnabled();
  await page.getByRole("link", { name: /返回首页换个玩法/ }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("2 人局直选「谁最可能」（minPlayers=3）：同样被 setup 拦住", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /谁最可能/ }).click();
  await expect(page).toHaveURL(/\/setup\?pack=most-likely/);

  await shrinkTo(page, 2);

  await expect(page.locator(".setup-pack-notice")).toContainText("至少需要 3 人");
  await expect(stepButton(page)).toBeDisabled();
});

test("2 人局的 AI 组局候选不再包含 3 人玩法（人数回收到 3 人后恢复）", async ({ page }) => {
  await page.goto("/setup");
  await page.getByLabel("减少玩家").click();
  await page.getByLabel("减少玩家").click();
  await page.getByLabel("减少玩家").click();
  await page.getByLabel("减少玩家").click();
  // 2 人：7 个真实玩法里的 pointing-game / most-likely 被剔除（含自定义在内共 5 个内置候选）。
  await expect(page.locator(".setup-mixed-count")).toContainText("5 个玩法");

  // 加回 1 人（3 人局）即恢复 7 个候选——门槛只跟在场人数走，不是永久禁用。
  await page.getByLabel("增加玩家").click();
  await expect(page.locator(".setup-mixed-count")).toContainText("7 个玩法");
});

test("3 人局直选「指人游戏」：照常进生成页并用本地题库出到指人卡", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /指人游戏/ }).click();
  await expect(page).toHaveURL(/\/setup\?pack=pointing-game/);

  await shrinkTo(page, 3);
  await expect(page.locator(".setup-pack-notice")).toHaveCount(0);

  await stepButton(page).click();
  await expect(page).toHaveURL(/\/boundaries/);
  await page.getByRole("button", { name: /下一步：生成游戏/ }).click();
  await expect(page).toHaveURL(/\/generating/);
  await page.getByRole("button", { name: /使用本地题库开始/ }).click();

  await expect(page).toHaveURL(/\/game/);
  await expect(page.locator(".pointing-game")).toBeVisible();
  await expect(page.locator(".empty-deck")).toHaveCount(0);
});

/**
 * R-CB4 第 4、6 条：候选为空必须停下提示、绝不回落到全量内置；主局切包与 setup 同一口径。
 */

async function disablePack(page: Page, name: string) {
  await page.goto("/packs");
  await page.getByLabel(`启用${name}`).click();
  await expect(page.getByLabel(`启用${name}`)).not.toBeChecked();
}

test("2 人局关掉所有 2 人玩法：候选归零、当场提示并拦住，不复活任何已关闭玩法", async ({ page }) => {
  // 只剩 3 人才玩得了的「谁最可能」「指人游戏」开着——旧代码在候选归零时会把这 5 个关掉的玩法全复活。
  for (const name of ["真心话大冒险", "我从来没有", "二选一", "默契测试", "转瓶子"]) await disablePack(page, name);

  await page.goto("/setup");
  await expect(page.locator(".setup-mixed-count")).toContainText("2 个玩法");

  await shrinkTo(page, 2);
  await expect(page.locator(".setup-mixed-count")).toContainText("0 个玩法");

  const notice = page.locator(".setup-pack-notice");
  await expect(notice).toContainText("没有可玩的玩法");
  await expect(notice).toContainText("当前在场 2 人");
  // 拦住：CTA 变灰、不进雷区/生成页，出口是「去游戏包开启玩法」。
  await expect(stepButton(page)).toBeDisabled();
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("link", { name: /去游戏包开启玩法/ })).toBeVisible();

  // 一点人（3 人）就恢复：只剩两个 3 人玩法，被关掉的 2 人玩法一个都不回来。
  await page.getByLabel("增加玩家").click();
  await expect(page.locator(".setup-mixed-count")).toContainText("2 个玩法");
  await expect(stepButton(page)).toBeEnabled();
});

test("主局切包与 setup 同口径：2 人局面板里没有 3 人玩法，局中加到 3 人恢复", async ({ page }) => {
  await page.goto("/setup");
  await shrinkTo(page, 2);
  await stepButton(page).click();
  await page.getByRole("button", { name: /下一步：生成游戏/ }).click();
  await page.getByRole("button", { name: /使用本地题库开始/ }).click();
  await expect(page).toHaveURL(/\/game/);
  await expect(page.locator(".game-card")).toBeVisible();

  await page.getByRole("button", { name: /切换玩法/ }).click();
  const sheet = page.getByRole("dialog", { name: "切换玩法" });
  await expect(sheet.getByRole("button", { name: /指人游戏/ })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: /谁最可能/ })).toHaveCount(0);
  await expect(sheet.getByRole("button", { name: /真心话大冒险/ })).toHaveCount(1);
  await sheet.getByRole("button", { name: "取消" }).click();

  // 局中加到 3 人：同一个门槛立刻恢复，玩家不用退出重开。
  await page.getByLabel("打开局中设置").click();
  await page.getByRole("button", { name: /新增玩家/ }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /切换玩法/ }).click();
  await expect(page.getByRole("dialog", { name: "切换玩法" }).getByRole("button", { name: /指人游戏/ })).toBeVisible();
});
