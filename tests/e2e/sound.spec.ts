import { expect, test, type Page } from "@playwright/test";
import { seedSession, startLocalGame } from "./helpers";
import { BUILTIN_SEED_CARDS } from "@/lib/game-packs/built-in-seeds";
import type { GameSession, Intensity } from "@/lib/domain/schemas";

/**
 * 音效（V1.7）：开关持久化 + 全链路触发不报错。
 * 听不见不断言声音——浏览器里没法断言“有没有响”，只断言交互照常、页面不炸、开关状态跨页面/刷新一致。
 */

const SPIN_SESSION_ID = "e2e-sound-spin-session";

/** 转瓶子单开局的真实建局形态：纯本地玩法不占题卡，链入用的真话卡由链自己补位。 */
function spinSession(): GameSession {
  const now = new Date().toISOString();
  const players = ["Alex", "Emma", "Kai"].map((displayName, index) => ({ id: `p${index + 1}`, displayName, active: true, createdAt: now, lastUsedAt: now }));
  return {
    schemaVersion: 2, id: SPIN_SESSION_ID, status: "active", mode: "single",
    config: {
      players, relationship: "friends", vibes: ["funny"], intensity: 3 as Intensity,
      boundaries: { noPhysicalContact: false, noAlcoholPenalty: true, noExPartners: false, noSexualHistory: false, noMoneyIncome: false, noPhonePrivacy: true, noPublicPosting: true, noStrangerContact: true, noPhotoVideo: false, noSocialAccounts: false, customText: "" },
      enabledPackIds: ["spin-bottle", "truth-dare"], mode: "single",
    },
    deckSnapshot: BUILTIN_SEED_CARDS.filter((card) => card.packId === "truth-dare"),
    usedCardIds: [], rounds: [], currentPackId: "spin-bottle", currentSegmentId: "e2e-sound-segment", currentPackState: {}, recentRejectedFingerprints: [],
    startedAt: now, updatedAt: now,
  };
}

/** 收集未捕获异常与 console error：音效（以及任何交互）都不许把现场搞崩。 */
function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  return errors;
}

const soundToggle = (page: Page) => page.getByLabel("音效开关");

test("设置页音效开关默认开、可关，关掉后刷新仍然静音（持久化）", async ({ page }) => {
  await page.goto("/settings/ai");

  await expect(soundToggle(page)).toBeChecked();
  await expect(page.getByText("已开启", { exact: true })).toBeVisible();

  await soundToggle(page).click();
  await expect(soundToggle(page)).not.toBeChecked();
  await expect(page.getByText("已静音", { exact: true })).toBeVisible();

  // 刷新后从本地偏好恢复（默认交给 hydrate，断言是重试直到落地的）
  await page.reload();
  await expect(soundToggle(page)).not.toBeChecked();
  await expect(page.getByText("已静音", { exact: true })).toBeVisible();

  // 回到默认：开关再次打开
  await soundToggle(page).click();
  await expect(soundToggle(page)).toBeChecked();
  await expect(page.getByText("已开启", { exact: true })).toBeVisible();
});

test("局中设置的音效开关与设置页共用同一份偏好", async ({ page }) => {
  await startLocalGame(page);

  await page.getByLabel("打开局中设置").click();
  const toggle = soundToggle(page);
  await expect(toggle).toBeVisible();
  await expect(toggle).toBeChecked();

  await toggle.click();
  await expect(toggle).not.toBeChecked();
  // 局中开关是内存态即时变、IndexedDB异步落盘：等落盘再跨页，否则设置页hydrate读到旧值（时序竞态）。
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto("/settings/ai");
  await expect(soundToggle(page)).not.toBeChecked();
  await expect(page.getByText("已静音", { exact: true })).toBeVisible();

  // 复原，避免影响同文件后续用例（同浏览器上下文共用 IndexedDB）
  await soundToggle(page).click();
  await expect(soundToggle(page)).toBeChecked();
});

test("开着音效走完开局到收局的主链，没有任何报错", async ({ page }) => {
  const errors = trackErrors(page);

  await startLocalGame(page);            // 首页 → 组局 → 雷区 → 生成（tick/叮）→ 主局（翻牌）
  await page.getByRole("button", { name: "完成" }).click();
  await expect(page.getByText(/第 \d+ \/ /)).toBeVisible();
  await page.getByRole("button", { name: "换一个" }).click();
  await expect(page.getByText(/第 \d+ \/ /)).toBeVisible();

  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(page.getByText("本局已暂停")).toBeVisible();
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.getByText("本局已暂停")).toHaveCount(0);

  await page.getByRole("button", { name: /切换玩法/ }).click();
  await page.getByRole("dialog", { name: "切换玩法" }).locator("button.sheet-option:not([disabled])").first().click();
  await expect(page.locator(".game-card")).toBeVisible();

  await page.getByRole("button", { name: "结束", exact: true }).click();
  await page.getByRole("button", { name: "确认结束" }).click();
  await expect(page).toHaveURL(/\/summary/);
  await expect(page.getByRole("heading", { name: /今晚游戏结束/ })).toBeVisible();

  expect(errors).toEqual([]);
});

test("转瓶子音效链路：呼呼循环 / 减速 tick / 落定叮 / 链入音全都不报错", async ({ page }) => {
  const errors = trackErrors(page);

  await seedSession(page, spinSession());
  await page.goto(`/game?session=${SPIN_SESSION_ID}`);
  await expect(page.locator(".spin-bottle")).toBeVisible();

  await page.getByRole("button", { name: "开始旋转" }).click();
  await expect(page.locator(".spin-bottle__target")).toBeVisible();
  await page.getByRole("button", { name: "真心话" }).click();
  await expect(page.locator(".game-card")).toBeVisible();

  expect(errors).toEqual([]);
});
