import { expect, test } from "@playwright/test";
import { currentSessionId, readSession, startPackGame } from "./helpers";

/**
 * 目标 AI 玩法无缓存 + 断网时切玩法（T203 / FR-045 / SC-015）：
 * switchPack 必须先本地 seed 立即补位、即刻可玩，不出现阻塞 loading、不等网络。
 */
test("断网且目标玩法无缓存时，切换玩法立刻用本地 seed 进入可玩态", async ({ page, context }) => {
  await startPackGame(page, /我从来没有/);
  const id = currentSessionId(page);
  const before = await readSession(page, id);
  // 这一局完全没有二选一题卡（目标玩法“无缓存”）
  expect(before.deckSnapshot.some((card) => card.packId === "would-you-rather")).toBe(false);

  // 断网 + 任何 AI 接口调用都直接失败：切玩法不该碰网络
  await page.route("**/api/**", (route) => route.abort("internetdisconnected"));
  await context.setOffline(true);

  await page.getByRole("button", { name: /切换玩法/ }).click();
  await page.getByRole("dialog", { name: "切换玩法" }).getByRole("button", { name: /二选一/ }).click();

  // 立即进入可玩态：A / VS / B 立刻出现，仍在主局、没有回落生成页
  await expect(page.locator(".would-you-rather")).toBeVisible();
  await expect(page.locator(".would-you-rather__options")).toContainText("VS");
  await expect(page).toHaveURL(/\/game\?session=/);

  // 断网下继续玩：换一个 + 下一题都不卡
  // 注：V1.5 手动切玩法开新段，顶栏从第 1 轮重计；换一个不推进（仍第 1），下一题完成后才到第 2
  await page.getByRole("button", { name: "换一个" }).click();
  await expect(page.locator(".would-you-rather")).toBeVisible();
  await expect(page.getByText(/第 1 \/ /)).toBeVisible();
  await page.getByRole("button", { name: "下一题" }).click();
  await expect(page.getByText(/第 2 \/ /)).toBeVisible();

  const after = await readSession(page, id);
  expect(after.id).toBe(before.id);
  expect(after.currentPackId).toBe("would-you-rather");
  expect(after.deckSnapshot.some((card) => card.packId === "would-you-rather")).toBe(true);
  // 补位的是本地 seed，不是 AI 卡
  const dealt = after.deckSnapshot.filter((card) => card.packId === "would-you-rather");
  expect(dealt.every((card) => card.source === "builtin")).toBe(true);

  await context.setOffline(false);
});
