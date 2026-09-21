import { expect, test } from "@playwright/test";

test("DeepSeek 默认，OpenCode Go 仅实验性手动启用", async ({ page }) => {
  await page.goto("/settings/ai");
  await expect(page.getByLabel("DeepSeek 官方")).toBeChecked();
  await expect(page.getByText("默认", { exact: true })).toBeVisible();
  await expect(page.getByText("实验性", { exact: true })).toBeVisible();
  await page.getByLabel("OpenCode Go").check();
  await expect(page.getByText(/主要面向 OpenCode \/ 同类 coding agents/)).toBeVisible();
  await expect(page.getByText(/绝不自动 fallback/)).toBeVisible();
  await expect(page.getByText(/免费 Zen/)).toHaveCount(0);
});

test("API Key 加密保存后刷新仍为已配置", async ({ page }) => {
  await page.goto("/settings/ai");
  await page.getByRole("textbox", { name: "API Key", exact: true }).fill("sk-e2e-never-log-this-123456");
  await page.getByRole("button", { name: "保存配置" }).click();
  await expect(page.getByText(/配置已加密保存|仅本次会话使用/)).toBeVisible();
  await expect(page.getByRole("button", { name: /清空 API 密钥/ })).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("button", { name: /清空 API 密钥/ })).toBeEnabled();
});

test("Provider 切换会持久化，Custom OpenAI Compatible 可完整配置", async ({ page }) => {
  await page.goto("/settings/ai");
  await page.getByRole("button", { name: /添加自定义 OpenAI Compatible/ }).click();
  await page.getByLabel("提供商名称").fill("我的兼容接口");
  await page.getByLabel("Base URL").fill("https://api.example.com/v1");
  await page.getByLabel("模型").fill("example-model");
  await page.getByRole("textbox", { name: "API Key", exact: true }).fill("sk-custom-e2e-not-real-123456");
  await page.getByRole("button", { name: "保存配置" }).click();
  await expect(page.getByText(/配置已加密保存|仅本次会话使用/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("我的兼容接口")).toBeChecked();
  await expect(page.getByText(/HTTPS 公网地址/)).toBeVisible();
});

test("浅色模式切换后跨页面与刷新保持", async ({ page }) => {
  await page.goto("/settings/ai");
  await page.getByRole("button", { name: "浅色" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.goto("/setup");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
