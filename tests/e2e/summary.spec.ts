import { expect, test } from "@playwright/test";
import { startLocalGame } from "./helpers";

test("结束总结完整，再来一局复用配置但创建新 Session", async ({ page }) => {
  await startLocalGame(page);
  const originalId = new URL(page.url()).searchParams.get("session");
  await page.getByRole("button", { name: "完成" }).click();
  await page.getByLabel("打开局中设置").click();
  await page.getByRole("button", { name: "结束本局" }).click();
  await expect(page.getByRole("heading", { name: "今晚游戏结束！" })).toBeVisible();
  await expect(page.getByText("游戏轮次")).toBeVisible();
  await expect(page.getByText("游戏总时长")).toBeVisible();
  await expect(page.getByText("参与人数")).toBeVisible();
  await expect(page.getByText("本场游戏数据")).toBeVisible();
  await page.getByRole("button", { name: /再来一局/ }).click();
  await expect(page).toHaveURL(/\/generating\?session=/);
  expect(new URL(page.url()).searchParams.get("session")).not.toBe(originalId);
});
