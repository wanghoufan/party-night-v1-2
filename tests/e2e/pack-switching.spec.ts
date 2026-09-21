import { expect, test, type Page } from "@playwright/test";
import { countSessions, currentSessionId, readSession, startLocalGame, startPackGame } from "./helpers";

const switchEntry = (page: Page) => page.getByRole("button", { name: /切换玩法/ });
const sheet = (page: Page) => page.getByRole("dialog", { name: "切换玩法" });

test("同一局连续切换玩法，Session ID / 配置 / 尺度不变", async ({ page }) => {
  await startPackGame(page, /我从来没有/);
  const id = currentSessionId(page);
  const before = await readSession(page, id);
  await expect(switchEntry(page)).toContainText("我从来没有");

  // 我从来没有 → 二选一：同一个 Session 直接换玩法出题
  await switchEntry(page).click();
  await expect(sheet(page).getByRole("button", { name: /我从来没有/ })).toHaveAttribute("aria-current", "true");
  await sheet(page).getByRole("button", { name: /二选一/ }).click();
  await expect(switchEntry(page)).toContainText("二选一");
  await expect(page.locator(".game-card h1")).toContainText("VS");

  // 二选一 → 转瓶子：切到目前还没有题卡内容的玩法，不得白屏，入口仍在
  await switchEntry(page).click();
  await sheet(page).getByRole("button", { name: /转瓶子/ }).click();
  await expect(page.getByRole("heading", { name: /暂时没有可玩的题卡/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "返回首页" })).toBeVisible();
  await switchEntry(page).click();
  await expect(sheet(page).getByRole("button", { name: /转瓶子/ })).toHaveAttribute("aria-current", "true");

  // 转瓶子 → 真心话大冒险
  await sheet(page).getByRole("button", { name: /真心话大冒险/ }).click();
  await expect(page.locator(".game-card")).toBeVisible();
  await expect(switchEntry(page)).toContainText("真心话大冒险");

  const after = await readSession(page, id);
  expect(after.id).toBe(before.id);
  expect(after.config).toEqual(before.config);
  expect(after.config.intensity).toBe(before.config.intensity);
  expect(after.mode).toBe(before.mode);
  expect(after.currentPackId).toBe("truth-dare");
  expect(after.rounds.map((round) => round.packId)).toEqual(["never-have", "would-you-rather"]);
  expect(after.rounds.map((round) => round.status)).toEqual(["skipped", "skipped"]);
});

test("已有进行中的局，首页点另一个玩法直接切换并回到主局", async ({ page }) => {
  await startLocalGame(page);
  const id = currentSessionId(page);

  await page.goto("/");
  await page.getByRole("link", { name: /谁最可能/ }).click();

  await expect(page).toHaveURL(new RegExp(`/game\\?session=${id}`));
  await expect(switchEntry(page)).toContainText("谁最可能");
  await expect(page.locator(".game-card")).toBeVisible();
  expect((await readSession(page, id)).currentPackId).toBe("most-likely");
});

test("没有进行中的局，首页玩法走既有 quick setup 预选，不再开第二套向导", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /谁最可能/ }).click();

  await expect(page).toHaveURL(/\/setup\?pack=most-likely/);
  await expect(page.getByRole("heading", { name: "快速开局" })).toBeVisible();
  await expect(page.getByRole("button", { name: /下一步：雷区设置/ })).toBeVisible();
  expect(await countSessions(page)).toBe(0);
});
