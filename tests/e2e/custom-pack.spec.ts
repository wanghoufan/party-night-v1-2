import { expect, test } from "@playwright/test";

test("创建并持久化自定义游戏包", async ({ page }) => {
  await page.goto("/packs");
  await page.getByRole("link", { name: /新建/ }).first().click();
  await page.getByLabel("名称").fill("朋友梗合集");
  for (const content of ["讲一个只有我们知道的梗", "给今晚起个代号", "说出最近的快乐瞬间"]) {
    await page.getByRole("button", { name: /添加题卡/ }).click();
    await page.getByPlaceholder("输入题目内容").last().fill(content);
  }
  await page.getByRole("button", { name: "保存游戏包" }).click();
  await expect(page.getByText("朋友梗合集")).toBeVisible();
  await page.reload();
  await expect(page.getByText("3 张题卡")).toBeVisible();
});
