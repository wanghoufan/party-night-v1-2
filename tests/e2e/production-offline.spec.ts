import { expect, test } from "@playwright/test";
import { startLocalGame } from "./helpers";

test.skip(process.env.PARTY_NIGHT_PRODUCTION_SMOKE !== "true", "仅针对 production build 运行");

test("已访问的当前 Session 可在完全离线后重载恢复", async ({ page, context }) => {
  await startLocalGame(page);
  await expect.poll(async () => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)).toBe("activated");
  await page.reload();
  await expect(page.locator(".game-card")).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".game-card")).toBeVisible();
  await page.getByRole("button", { name: "完成" }).click();
  await expect(page.getByText(/第 2 \/ /)).toBeVisible();
  await context.setOffline(false);
});
