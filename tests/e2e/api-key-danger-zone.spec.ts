import { expect, test } from "@playwright/test";

test("清空密钥必须二次确认，取消后保留，确认后才删除", async ({ page }) => {
  await page.goto("/settings/ai");
  await page.getByRole("textbox", { name: "API Key", exact: true }).fill("sk-danger-zone-test-123456");
  await page.getByRole("button", { name: "保存配置" }).click();
  const clear = page.getByRole("button", { name: /清空 API 密钥/ });
  await clear.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
  await expect(clear).toBeEnabled();
  await clear.click();
  await page.getByRole("button", { name: "确认清空" }).click();
  await expect(page.getByText("API 密钥已清空", { exact: true })).toBeVisible();
  await expect(clear).toBeDisabled();
});
