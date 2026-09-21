import { expect, test } from "@playwright/test";

/**
 * T185 [US1] / FR-004 / FR-041：锁死设置页的既有结构与密钥安全交互。
 * 外观深浅色、Provider/Model/Base URL/API Key 配置入口、清空密钥的危险样式与二次确认，
 * 都是 V1.0 已验收的交互，V1.2 只允许继承；被改掉就红。
 */
const STYLE_PROBE = (element: Element) => {
  const style = getComputedStyle(element);
  return { background: style.backgroundColor, border: style.borderTopColor, color: style.color };
};

test("外观深浅色可切换并跨页面与刷新保持", async ({ page }) => {
  await page.goto("/settings/ai");
  await expect(page.getByRole("heading", { name: "外观" })).toBeVisible();
  const dark = page.getByRole("button", { name: "深色" });
  const light = page.getByRole("button", { name: "浅色" });
  await expect(dark).toHaveAttribute("aria-pressed", "true");
  await expect(light).toHaveAttribute("aria-pressed", "false");

  await light.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.goto("/setup");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.goto("/settings/ai");
  await dark.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("AI Provider / Model / Base URL / API Key 配置入口保持", async ({ page }) => {
  await page.goto("/settings/ai");

  // Provider 入口：默认 DeepSeek，实验性 OpenCode Go 手动可选。
  await expect(page.getByRole("group", { name: "选择提供商" })).toBeVisible();
  await expect(page.getByLabel("DeepSeek 官方")).toBeChecked();
  await expect(page.getByText("默认", { exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: /OpenCode Go/ })).toBeVisible();
  await expect(page.getByText("实验性", { exact: true })).toBeVisible();

  // Model / Base URL 入口：内置 Provider 只读展示，自定义 Provider 可编辑。
  await expect(page.getByLabel("模型")).toHaveValue("deepseek-flash");
  await expect(page.getByLabel("模型")).toHaveAttribute("readonly", "");
  await expect(page.getByLabel("Base URL")).toHaveValue("https://api.deepseek.com");
  await expect(page.getByLabel("Base URL")).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: /添加自定义 OpenAI Compatible/ }).click();
  await expect(page.getByLabel("Base URL")).not.toHaveAttribute("readonly", "");
  await expect(page.getByLabel("模型")).not.toHaveAttribute("readonly", "");

  // API Key 入口：默认脱敏，可显隐；不暴露已保存的明文。
  const secret = page.getByRole("textbox", { name: "API Key", exact: true });
  await expect(secret).toHaveAttribute("type", "password");
  await expect(secret).toHaveValue("");
  await page.getByRole("button", { name: "显示 API Key" }).click();
  await expect(secret).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "隐藏 API Key" }).click();

  await expect(page.getByRole("button", { name: /测试连接/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "保存配置" })).toBeVisible();
});

test("清空 API Key 保留危险样式区分与二次确认", async ({ page }) => {
  await page.goto("/settings/ai");

  const clear = page.getByRole("button", { name: /清空 API 密钥/ });
  const save = page.getByRole("button", { name: "保存配置" });
  // 未配置时清空按钮不可点，危险区仍在。
  await expect(page.getByRole("heading", { name: "危险操作" })).toBeVisible();
  await expect(clear).toBeDisabled();

  await page.getByRole("textbox", { name: "API Key", exact: true }).fill("sk-regression-never-log-123456");
  await save.click();
  await expect(clear).toBeEnabled();

  // 危险样式：危险按钮与普通主按钮必须有可见区分（背景/边框/文字色至少一项不同）。
  await expect(clear).toHaveClass(/button--danger/);
  const dangerStyle = await clear.evaluate(STYLE_PROBE);
  const saveStyle = await save.evaluate(STYLE_PROBE);
  expect(dangerStyle).not.toEqual(saveStyle);

  // 二次确认：取消保留密钥，确认后才清空并回到未配置态。
  await clear.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("确认清空 API 密钥？");
  await page.getByRole("button", { name: "取消" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(clear).toBeEnabled();
  await expect(page.getByText("API 密钥已清空", { exact: true })).toHaveCount(0);

  await clear.click();
  await page.getByRole("button", { name: "确认清空" }).click();
  await expect(page.getByText("API 密钥已清空", { exact: true })).toBeVisible();
  await expect(clear).toBeDisabled();
});
