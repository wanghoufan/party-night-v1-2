import { expect, test } from "@playwright/test";
import { startLocalGame } from "./helpers";

test("跳过无惩罚，局中强度、暂停和恢复立即生效", async ({ page }) => {
  await startLocalGame(page);
  // V1.5：跳过无惩罚也不推进顶栏计数（只数已完成轮次），仍停在第 1 轮
  await page.getByRole("button", { name: "跳过" }).click();
  await expect(page.getByText(/第 1 \/ /)).toBeVisible();
  await page.getByLabel("打开局中设置").click();
  await page.getByLabel("游戏强度").fill("1");
  await page.getByRole("button", { name: "暂停本局" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("本局已暂停")).toBeVisible();
  await page.getByLabel("打开局中设置").click();
  await page.getByRole("button", { name: "继续本局" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("本局已暂停")).toHaveCount(0);
});
