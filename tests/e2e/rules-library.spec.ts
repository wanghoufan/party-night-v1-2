import { expect, test } from "@playwright/test";
import { RULE_CATALOG } from "@/lib/rules/catalog";

/**
 * V1.1 Phase 14 / T182 + T183：
 * 游戏包 → 规则 → 规则详情 3 次点击内可达；8 条均可导航；搜不到走空状态且不调 AI。
 */

test("从首页到小姐牌详情不超过 3 次点击（T182 / SC-007）", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("navigation", { name: "主导航" }).getByRole("link", { name: "游戏包" }).click(); // 1
  await page.getByRole("button", { name: "规则" }).click(); // 2
  await page.getByRole("link", { name: /小姐牌/ }).click(); // 3

  await expect(page).toHaveURL(/\/packs\/rules\/miss-card/);
  await expect(page.getByRole("heading", { level: 1, name: /小姐牌/ })).toBeVisible();
});

test("首批 8 条规则都能从列表进详情（T182 / FR-030）", async ({ page }) => {
  await page.goto("/packs?tab=rules");
  const list = page.getByRole("region", { name: "规则" });
  await expect(page.getByRole("searchbox", { name: "搜索规则" })).toBeVisible();

  for (const entry of RULE_CATALOG) {
    await list.locator(`a[href="/packs/rules/${entry.id}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/packs/rules/${entry.id}$`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(entry.title.slice(0, 2));
    await expect(page.getByRole("region", { name: "30 秒看懂" })).toBeVisible();
    await page.getByRole("link", { name: "返回规则库" }).click();
    await expect(page.getByRole("searchbox", { name: "搜索规则" })).toBeVisible();
  }
});

test("详情不给“开始游戏”主 CTA，也不进主局（T181 / FR-033）", async ({ page }) => {
  await page.goto("/packs/rules/miss-card");

  await expect(page.getByRole("link", { name: /开始游戏|开始手机游戏|开始一局/ })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "主导航" })).toBeVisible();
  // 底部四 Tab 不变，规则库不新增 Tab
  expect(await page.getByRole("navigation", { name: "主导航" }).getByRole("link").count()).toBe(4);
});

test("搜不到规则时给空状态，且不调用 AI/网络（T183 / Spec §9）", async ({ page }) => {
  const apiCalls: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/")) apiCalls.push(request.url());
  });

  await page.goto("/packs?tab=rules");
  await page.getByRole("searchbox", { name: "搜索规则" }).fill("绝不存在的玩法xyz");

  await expect(page.getByRole("heading", { name: "没有找到规则" })).toBeVisible();
  await expect(page.getByRole("link", { name: /小姐牌/ })).toHaveCount(0);
  expect(apiCalls).toEqual([]);
});

test("分类 chips 只筛同类，清空搜索恢复全部 8 条（T179）", async ({ page }) => {
  await page.goto("/packs?tab=rules");
  const chips = page.getByRole("group", { name: "规则分类" });
  const cards = page.getByRole("region", { name: "规则" }).getByRole("link");
  await expect(cards).toHaveCount(8);

  await chips.getByRole("button", { name: "扑克" }).click();
  await expect(cards).toHaveCount(2);
  await expect(page.getByRole("link", { name: /小姐牌/ })).toBeVisible();

  // 分类与搜索同时生效：扑克里没有数字炸弹
  await page.getByRole("searchbox", { name: "搜索规则" }).fill("数字炸弹");
  await expect(page.getByRole("heading", { name: "没有找到规则" })).toBeVisible();

  await page.getByRole("searchbox", { name: "搜索规则" }).fill("");
  await chips.getByRole("button", { name: "全部" }).click();
  await expect(cards).toHaveCount(8);
});
