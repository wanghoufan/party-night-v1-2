import { expect, test, type Page } from "@playwright/test";
import { seedSession } from "./helpers";
import type { GameCard, GameSession, Intensity } from "@/lib/domain/schemas";

const SPIN_ID = "probe-spin-desktop";
const POINT_ID = "probe-point-desktop";

const EMPTY_DECK: GameCard[] = [];

function session(id: string, names: string[], packId: string, deck: GameCard[] = EMPTY_DECK): GameSession {
  const now = new Date().toISOString();
  const players = names.map((displayName, i) => ({ id: `p${i + 1}`, displayName, active: true, createdAt: now, lastUsedAt: now }));
  return {
    schemaVersion: 2, id, status: "active", mode: "single",
    config: {
      players, relationship: "friends", vibes: ["funny"], intensity: 3 as Intensity,
      boundaries: { noPhysicalContact: false, noAlcoholPenalty: true, noExPartners: false, noSexualHistory: false, noMoneyIncome: false, noPhonePrivacy: true, noPublicPosting: true, noStrangerContact: true, noPhotoVideo: false, noSocialAccounts: false, customText: "" },
      enabledPackIds: [packId, "truth-dare"], mode: "single",
    },
    deckSnapshot: deck, usedCardIds: [], rounds: [],
    currentPackId: packId, currentSegmentId: "probe-segment", currentPackState: {}, recentRejectedFingerprints: [],
    startedAt: now, updatedAt: now,
  };
}

const pointingDeck: GameCard[] = Array.from({ length: 8 }, (_, i) => ({
  id: `probe-pointing-${i + 1}`, packId: "pointing-game", type: "pointing" as const,
  content: `指一个今晚最有梗的人（第 ${i + 1} 题）。`, instruction: "倒数三秒，一起指向那个人",
  intensity: 2 as Intensity, tags: [], boundaryTags: [], minPlayers: 3, participantMode: "all" as const, source: "builtin" as const,
}));

/**
 * 座位盒到中央瓶子圆的最小间距（>0 = 不遮挡）。
 * 瓶子外圈会被 rotate 动画转起来，getBoundingClientRect 会返回旋转后的外接矩形（虚胖），
 * 所以半径必须取 offsetWidth/2（布局尺寸，不受 transform 影响）；圆心在 transform-origin 上，旋转不移动它。
 */
const CLEARANCE_FN = `(() => {
  const bottle = document.querySelector(".spin-bottle__bottle");
  const rect = bottle.getBoundingClientRect();
  const bc = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  const r = bottle.offsetWidth / 2;
  return Array.from(document.querySelectorAll(".spin-bottle__seats li")).map((el) => {
    const b = el.getBoundingClientRect();
    const nx = Math.max(b.left, Math.min(bc.x, b.right));
    const ny = Math.max(b.top, Math.min(bc.y, b.bottom));
    return { text: el.textContent, gap: Math.round((Math.hypot(nx - bc.x, ny - bc.y) - r) * 10) / 10 };
  });
})()`;

const giant = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll("svg, .button")).map((el) => {
  const r = el.getBoundingClientRect();
  return { tag: el.tagName.toLowerCase(), inButton: Boolean(el.closest("button")), w: Math.round(r.width), h: Math.round(r.height) };
}).filter((s) => s.w > 60 && s.h > 60 && !s.inButton));

const boxes = (page: Page, sel: string) => page.locator(sel).first().boundingBox();

test.describe("desktop 1280x800", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("转瓶子 ready/result：座位零遮挡 + 无巨型元素", async ({ page }) => {
    await seedSession(page, session(SPIN_ID, ["玩家1", "玩家2", "玩家3", "玩家4", "玩家5", "玩家6"], "spin-bottle"));
    await page.goto(`/game?session=${SPIN_ID}`);
    await expect(page.locator(".spin-bottle")).toBeVisible();
    await page.waitForTimeout(600);

    const card = await boxes(page, ".game-card");
    const startBtn = await boxes(page, ".spin-bottle__controls .button");
    const bottle = await boxes(page, ".spin-bottle__bottle");
    const stage = await boxes(page, ".spin-bottle__stage");
    console.log("READY " + JSON.stringify({
      readyClear: await page.evaluate(CLEARANCE_FN), giant: await giant(page),
      card: `${Math.round(card!.width)}x${Math.round(card!.height)}`,
      startBtn: `${Math.round(startBtn!.width)}x${Math.round(startBtn!.height)}`,
      bottle: `${Math.round(bottle!.width)}x${Math.round(bottle!.height)}`,
      stage: `${Math.round(stage!.width)}x${Math.round(stage!.height)}`,
      overflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }));
    await page.screenshot({ path: "test-results/desktop-spin-ready.png", fullPage: true });

    await page.getByRole("button", { name: "开始旋转" }).click();
    await expect(page.locator(".spin-bottle__result")).toBeVisible();
    await page.waitForTimeout(400);
    const again = await boxes(page, ".spin-bottle__again");
    const choice = await boxes(page, ".spin-bottle__choices .button");
    const card2 = await boxes(page, ".game-card");
    console.log("RESULT " + JSON.stringify({
      resultClear: await page.evaluate(CLEARANCE_FN), giant: await giant(page),
      again: `${Math.round(again!.width)}x${Math.round(again!.height)}`,
      choice: `${Math.round(choice!.width)}x${Math.round(choice!.height)}`,
      card: `${Math.round(card2!.width)}x${Math.round(card2!.height)}`,
      target: await page.locator(".spin-bottle__target").textContent(),
    }));
    await page.screenshot({ path: "test-results/desktop-spin-result.png", fullPage: true });
  });

  test("转瓶子长昵称：座位仍不与瓶子重叠", async ({ page }) => {
    // 长名字放在 60° 侧的座位（最靠近瓶子的方位）而不是正上方。
    await seedSession(page, session(SPIN_ID, ["玩家1", "小明的超长昵称呢", "玩家3", "玩家4", "玩家5", "玩家6"], "spin-bottle"));
    await page.goto(`/game?session=${SPIN_ID}`);
    await expect(page.locator(".spin-bottle")).toBeVisible();
    await page.waitForTimeout(600);
    console.log("LONGNAME " + JSON.stringify({
      clear: await page.evaluate(CLEARANCE_FN),
      overflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }));
    await page.screenshot({ path: "test-results/desktop-spin-longname.png", fullPage: true });
  });

  test("指人游戏 counting 态：无巨型按钮", async ({ page }) => {
    await seedSession(page, session(POINT_ID, ["玩家1", "玩家2", "玩家3"], "pointing-game", pointingDeck));
    await page.goto(`/game?session=${POINT_ID}`);
    await expect(page.locator(".pointing-game")).toBeVisible();
    await page.getByRole("button", { name: "准备好了" }).click();
    await expect(page.locator(".pointing-game__count")).toBeVisible();
    const skip = await boxes(page, ".pointing-game__controls .button");
    console.log("POINTING " + JSON.stringify({
      giant: await giant(page), skip: `${Math.round(skip!.width)}x${Math.round(skip!.height)}`,
      overflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    }));
    await page.screenshot({ path: "test-results/desktop-pointing-counting.png", fullPage: true });
  });

  test("其他页面（首页/设置/游戏包）桌面无横向溢出", async ({ page }) => {
    for (const path of ["/", "/packs", "/settings"]) {
      await page.goto(path);
      await page.waitForTimeout(300);
      const shell = await page.evaluate(() => {
        const el = document.querySelector(".screen");
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), left: Math.round(r.left) };
      });
      console.log(`SHELL ${path} ` + JSON.stringify({ shell, overflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) }));
      await page.screenshot({ path: `test-results/desktop-shell-${path.replace(/\W+/g, "-") || "root"}.png` });
    }
  });
});
