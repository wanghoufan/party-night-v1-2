/**
 * 真机自动化走局（WebView CDP 通道）
 * ---------------------------------------------------------------------------
 * 通道：Playwright `chromium.connectOverCDP` 直连 Android WebView 远程调试端点
 *       （adb forward tcp:PORT localabstract:webview_devtools_remote_<pid>）。
 *
 * 场景（同一套状态机与选择器，只换局内配置与互选剧本）：
 *   - 4p：2男2女 Alex/Emma/Kai/Mia → 互选 1 对（Alex×Emma），Kai/Mia 跳过。
 *   - 5p：3男2女 Alex/Kai/Leo/Emma/Mia → 互选 2 对（Alex×Emma、Kai×Mia），Leo 跳过；
 *         用于验证 D5「同一玩家每局 active MATCH 上限 2」语义：同局多 MATCH 并存、
 *         无重复 pair、无单人超上限（脚本按落库关系态逐人计数断言）。
 *
 * 流程：组局 → 开局 → 连点 9 轮完成 → 断言私密互选 dialog 出现 → 按剧本走完互选
 *       → 截图（`4p-` / `5p-` 前缀：主局/互选/结果/收束）→ 回主局断言 MATCH 落盘 → 应用内正常收局。
 *
 * 约束：不改业务代码；不删手机任何数据；不重装包；不写死坐标（一律走 role/label 选择器）。
 * 用法：npx tsx tests/phone/party-run.ts [dev63|dev31|all] [4p|5p]
 *       默认 dev63→4p、dev31→5p（与两台真机的分工一致）。
 */
import { chromium, type Browser, type Page } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = join(process.cwd(), "test-results", "phone");
const APP_URL = "http://192.168.31.60:3000";

const MUTUAL_CHECK_TARGET_ROUNDS = 9;
const ROUND_HARD_CAP = 20;
/** V2 私密互选 D5：同一玩家每局 active MATCH 硬上限（与 lib/v2-relationship/v2-state.ts 同口径）。 */
const MAX_ACTIVE_MATCHES_PER_PLAYER = 2;

/**
 * 单次互选检查点的剧本与断言（D5 上限边界：一次 Session 内连跑 9/14/19）。
 * 每个阶段都断言三件事：公开结果、被拦 pair 零痕迹、落盘 MATCH 总数与逐人计数。
 */
interface MutualStage {
  /** 命中的常规互选检查点（9/14/19），与 relationshipEffectiveCardCount 同口径。 */
  checkpoint: number;
  /** 互选剧本：姓名 → 目标姓名；null＝跳过。 */
  plan: Readonly<Record<string, string | null>>;
  /** 本次互选后结果页「应公布」的 pair。 */
  expectedPublicPairs: readonly (readonly [string, string])[];
  /** 本次互选后「应被 D5 上限拦下」的 pair：结果页零痕迹、落盘零 MATCH。 */
  blockedPairs?: readonly (readonly [string, string])[];
  /** 本次互选后累计 MATCH 总数（落盘断言）。 */
  expectedTotalMatches: number;
  /**
   * 进入本检查点前，受控把 Session 的加玩开关置为 true（RG-05「经参与者知情同意的受控路径」）。
   * 现状：`EXTENSION_ACTIVATED_BY_HOST` 在生产 UI 未接线，第 3 次常规互选（19）在真机上
   * 无法自然触发；只改本地 Session 归档里的一个布尔，不删任何数据、不动业务代码。
   */
  activateExtensionBefore?: boolean;
}

interface Scenario {
  /** 同时作为截图前缀（4p- / 5p- / 5p-d5cap-）。 */
  id: string;
  title: string;
  names: readonly string[];
  /** 与 names 同序的当局性别（男/女）。 */
  genders: readonly string[];
  /** 互选剧本：姓名 → 目标姓名；null＝跳过。 */
  plan: Readonly<Record<string, string | null>>;
  /** 期望互选出的对（姓名二元组，顺序无关）。 */
  expectedPairs: readonly (readonly [string, string])[];
  /** 多检查点模式：给了就走 D5 上限边界连跑流程（忽略上面的单次 plan/expectedPairs）。 */
  stages?: readonly MutualStage[];
}

const SCENARIOS: Record<string, Scenario> = {
  "4p": {
    id: "4p",
    title: "4人局 2男2女",
    names: ["Alex", "Emma", "Kai", "Mia"],
    genders: ["男", "女", "男", "女"],
    plan: { Alex: "Emma", Emma: "Alex", Kai: null, Mia: null },
    expectedPairs: [["Alex", "Emma"]],
  },
  "5p": {
    id: "5p",
    title: "5人局 3男2女",
    names: ["Alex", "Kai", "Leo", "Emma", "Mia"],
    genders: ["男", "男", "男", "女", "女"],
    plan: { Alex: "Emma", Kai: "Mia", Leo: null, Emma: "Alex", Mia: "Kai" },
    expectedPairs: [
      ["Alex", "Emma"],
      ["Kai", "Mia"],
    ],
  },
  /**
   * D5 上限边界（5人局 3男2女，同一 Session 连跑 9/14/19 三个常规互选）：
   *   c9  Alex↔Emma                    → 1 对（Alex=1, Emma=1）
   *   c14 Alex↔Mia ＋ Kai↔Emma         → 3 对（Alex=2 触顶；Emma=2 触顶）
   *   c19 Kai↔Mia 成（两人各 1→2）      → 第 4 对；Leo↔Emma 被 D5 上限拦下（Emma 已 2）
   *       同一次 run 里「超限 pair 零痕迹、未超限 pair 照常成 MATCH」＝只拦超限那方。
   * 注：3男2女下 Alex 触顶后已无「新的女伴」可试，能被上限拦下的第 3 对必然由另一位
   *     触顶者（Emma）＋剩下的男生（Leo）构成；Alex 本阶段跳过，避免与已有 pair 重复公布
   *     污染零痕迹证据。
   */
  "5p-d5cap": {
    id: "5p-d5cap",
    title: "5人局 3男2女 · D5 上限 2 边界",
    names: ["Alex", "Kai", "Leo", "Emma", "Mia"],
    genders: ["男", "男", "男", "女", "女"],
    plan: {},
    expectedPairs: [],
    stages: [
      {
        checkpoint: 9,
        plan: { Alex: "Emma", Emma: "Alex", Kai: null, Mia: null, Leo: null },
        expectedPublicPairs: [["Alex", "Emma"]],
        expectedTotalMatches: 1,
      },
      {
        checkpoint: 14,
        plan: { Alex: "Mia", Mia: "Alex", Kai: "Emma", Emma: "Kai", Leo: null },
        expectedPublicPairs: [
          ["Alex", "Mia"],
          ["Kai", "Emma"],
        ],
        expectedTotalMatches: 3,
      },
      {
        checkpoint: 19,
        plan: { Kai: "Mia", Mia: "Kai", Leo: "Emma", Emma: "Leo", Alex: null },
        expectedPublicPairs: [["Kai", "Mia"]],
        blockedPairs: [["Leo", "Emma"]],
        expectedTotalMatches: 4,
        activateExtensionBefore: true,
      },
    ],
  },
  /**
   * Alex 触顶边界（5人局 2男3女，从零连跑 9/14/19 三个常规互选）：
   *   c9  Alex↔Emma        → 1 对（Alex=1, Emma=1）
   *   c14 Alex↔Mia         → 2 对（Alex=2 触顶；Mia=1）
   *   c19 Alex↔Zoe 双方互选 → 被 D5 上限拦下：不建 MATCH、结果页零痕迹、
   *       界面既不说哪一方到上限、也不出现该 pair；累计 MATCH 仍为 2。
   * 为什么必须是 2男3女：3男2女下 Alex 触顶后已无「新的女伴」可试，第 3 对无从发起，
   * 就无法把「上限拦截」与「重复 pair」两种语义分开验证。
   */
  "5p-d5cap-alex": {
    id: "5p-d5cap-alex",
    title: "5人局 2男3女 · Alex 第 3 对触顶拦截",
    names: ["Alex", "Kai", "Emma", "Mia", "Zoe"],
    genders: ["男", "男", "女", "女", "女"],
    plan: {},
    expectedPairs: [],
    stages: [
      {
        checkpoint: 9,
        plan: { Alex: "Emma", Emma: "Alex", Kai: null, Mia: null, Zoe: null },
        expectedPublicPairs: [["Alex", "Emma"]],
        expectedTotalMatches: 1,
      },
      {
        checkpoint: 14,
        plan: { Alex: "Mia", Mia: "Alex", Kai: null, Emma: null, Zoe: null },
        expectedPublicPairs: [["Alex", "Mia"]],
        expectedTotalMatches: 2,
      },
      {
        checkpoint: 19,
        plan: { Alex: "Zoe", Zoe: "Alex", Kai: null, Emma: null, Mia: null },
        expectedPublicPairs: [],
        blockedPairs: [["Alex", "Zoe"]],
        expectedTotalMatches: 2,
        activateExtensionBefore: true,
      },
    ],
  },
};

interface DeviceSpec {
  label: string;
  endpoint: string;
  /** 该机的默认场景。 */
  scenario: string;
  /** ADB 序列号 + android_id（日志用，便于对账物理机身份）。 */
  serial: string;
}

const DEVICES: DeviceSpec[] = [
  { label: "dev31", endpoint: "http://127.0.0.1:9331", scenario: "5p", serial: "192.168.31.31:5555 (android_id 4ab185ebe26feae1)" },
  { label: "dev63", endpoint: "http://127.0.0.1:9363", scenario: "4p", serial: "192.168.31.63:5555 (android_id 85cda94a40bc177c / IN9LZTAYV4UGU4JF)" },
];

interface StepLog {
  step: string;
  ms: number;
  note?: string;
}

interface RunReport {
  device: string;
  serial: string;
  scenario: string;
  scenarioTitle: string;
  channel: string;
  reachStep: string;
  /** 有效轮数（第 9 个有效轮触发互选检查点）。 */
  roundsCompleted: number;
  roundTimings: number[];
  avgRoundMs: number | null;
  /** 命中的互选检查点编号（9/14/19）。 */
  mutualCheckpoint: number | null;
  mutualAppeared: boolean;
  matchRecorded: string[] | null;
  matchCount: number;
  /** 姓名 → active MATCH 数（D5 逐人计数证据）。 */
  perPlayerMatchCounts: Record<string, number>;
  resultPageText: string | null;
  screenshots: string[];
  blockers: string[];
  steps: StepLog[];
  /** 多检查点（D5 上限边界）模式的逐阶段证据。 */
  stageEvidence?: StageEvidence[];
}

/** 单个互选检查点结束后的落盘证据。 */
interface StageEvidence {
  checkpoint: number;
  roundsAtCheckpoint: number;
  effectiveAtCheckpoint: number | null;
  /** 结果页实际公布的 pair（归一化 a×b）。 */
  publicPairs: string[];
  /** 结果页标题（「互选成功」＝有公布；「本轮已完成，继续游戏」＝零公布）。 */
  resultHeading: string;
  /** 期望被上限拦下、实际零痕迹的 pair。 */
  blockedPairsZeroTrace: string[];
  /** 结果页里是否出现上限/名额相关文案（应为 false）。 */
  capCopyOnResultPage: boolean;
  totalMatchesAfter: number;
  matchListAfter: string[];
  perPlayerAfter: Record<string, number>;
  extensionSeeded: boolean;
  screenshots: string[];
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

async function timed<T>(steps: StepLog[], step: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const out = await fn();
    steps.push({ step, ms: Date.now() - t0 });
    console.log(`    ✓ ${step} (${Date.now() - t0}ms)`);
    return out;
  } catch (error) {
    steps.push({ step, ms: Date.now() - t0, note: `FAIL: ${(error as Error).message.split("\n")[0]}` });
    throw error;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 读回本地 Session（与 App 同库同版本，不删库）。 */
async function readSession(page: Page, id: string) {
  return page.evaluate(`(() => new Promise((resolve, reject) => {
    const req = indexedDB.open("party-night-v1", 2);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("idb-blocked"));
    req.onsuccess = () => {
      const db = req.result;
      const all = db.transaction("sessions", "readonly").objectStore("sessions").getAll();
      all.onsuccess = () => {
        const rows = all.result || [];
        db.close();
        resolve(rows.find((r) => r.id === ${JSON.stringify(id)}) || null);
      };
      all.onerror = () => { db.close(); reject(all.error); };
    };
  }))()`);
}

interface SessionSnapshot {
  rounds: { status: string }[];
  status?: string;
  config: { players: { id: string; displayName: string }[]; mode: string; enabledPackIds: string[]; intensity?: number };
  participants?: { pairGender: string }[];
  relationshipState?: {
    relationshipEffectiveCardCount?: number;
    /** 已落盘的常规互选次数（DUE 事件计数）：收束落盘的可靠同步点。 */
    regularMutualCheckRuns?: number;
    lastMutualCheckAtEffectiveCount?: number | null;
    matches?: Record<string, { playerIds: string[] }>;
  };
}

function sessionIdFromUrl(page: Page): string {
  return new URL(page.url()).searchParams.get("session") ?? "";
}

/** 走应用内正常流程收局（顶栏「结束」→ 二次确认），不删任何数据。 */
async function finishCurrentSession(page: Page) {
  await page.locator(".round-header__end").click();
  await page.getByRole("button", { name: "确认结束" }).click();
  await page.waitForURL(/\/summary/, { timeout: 20000 });
  await page.goto(`${APP_URL}/`, { waitUntil: "commit", timeout: 15000 });
  await page.locator(".home-primary").waitFor({ state: "visible", timeout: 20000 });
}

async function shot(page: Page, name: string, files: string[]) {
  const file = join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, timeout: 40000 });
  files.push(file);
  console.log(`    📸 ${file}`);
}

/** 归一化 pair 文案：两个姓名排序后用 × 连接（与结果页展示无关，只用于断言）。 */
function normalizePair(a: string, b: string): string {
  return [a, b].sort().join("×");
}

/**
 * 真机 WebView 前台化 + 帧存活探针。
 *
 * 真机踩坑（2026-09-26 实测）：APP 被系统/管家压到后台时（MIUI 桌面盖在上面），
 * WebView 停止出帧 —— CDP 的 click / screenshot 会一直等帧直到超时（表现为
 * `locator.click: Timeout` 或 `page.screenshot: Timeout`，而 curl 与 ping 全正常）。
 * 这里不重启 APP、不删数据：只把该 WebView 标记为前台活跃并主动等一帧，快速失败。
 */
async function assertWebViewAlive(page: Page, steps: StepLog[]) {
  const t0 = Date.now();
  try {
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => undefined);
    await session.send("Page.setWebLifecycleState", { state: "active" }).catch(() => undefined);
    await session.detach().catch(() => undefined);
    const framed = await Promise.race([
      page.evaluate(`new Promise((resolve) => requestAnimationFrame(() => resolve(true)))`) as Promise<boolean>,
      sleep(6000).then(() => false),
    ]);
    if (!framed) throw new Error("WebView 6s 内未产出渲染帧，疑似被压后台（先跑 preflight.sh 把 APP 拉前台）");
    steps.push({ step: "WebView 帧存活探针", ms: Date.now() - t0 });
    console.log(`    ✓ WebView 帧存活探针 (${Date.now() - t0}ms)`);
  } catch (error) {
    steps.push({ step: "WebView 帧存活探针", ms: Date.now() - t0, note: `FAIL: ${(error as Error).message.split("\n")[0]}` });
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/* 互选：单人走完一轮（照搬 E2E 状态机语义，选择器按真机 DOM 走）          */
/* ------------------------------------------------------------------ */

async function playOnePerson(
  page: Page,
  name: string,
  chooseName: string | null,
  onSelect?: () => Promise<void>,
  onAfterPick?: () => Promise<void>,
): Promise<boolean> {
  const dialog = page.locator(".mutual-mask");
  await dialog.waitFor({ state: "visible", timeout: 15000 });
  let selectShotDone = false;
  for (let step = 0; step < 16; step += 1) {
    // 选择页（候选人列表）出现时留一张互选现场图。
    if (onSelect && !selectShotDone && (await dialog.locator(".mutual-choice-list").isVisible().catch(() => false))) {
      selectShotDone = true;
      await onSelect();
    }
    const finishBtn = dialog.getByRole("button", { name: /继续游戏|结束本轮私密互动/ });
    if (await finishBtn.isVisible().catch(() => false)) return true;

    const handed = dialog.getByRole("button", { name: "已交给 TA" });
    if (await handed.isVisible().catch(() => false)) {
      const h2 = (await dialog.locator("h2").textContent().catch(() => "")) ?? "";
      // 点名单向：不是叫这位就说明已走完（轮到下一位）。
      if (!h2 || !h2.includes(name)) return false;
      await handed.click();
      continue;
    }
    const yes = dialog.getByRole("button", { name: "是，继续" });
    if (await yes.isVisible().catch(() => false)) { await yes.click(); continue; }

    const ready = dialog.getByRole("button", { name: "我准备好了" });
    if (await ready.isVisible().catch(() => false)) { await ready.click(); continue; }

    if (chooseName) {
      const opt = dialog.getByRole("button", { name: chooseName, exact: true });
      if (await opt.isVisible().catch(() => false)) {
        await opt.click();
        // 选项已高亮、尚未提交：留一张「本人确实选了 TA」的现场图（提交后不回显）。
        if (onAfterPick) await onAfterPick();
        await dialog.getByRole("button", { name: "提交", exact: true }).click();
        continue;
      }
    } else {
      const skip = dialog.getByRole("button", { name: "跳过" }).first();
      if (await skip.isVisible().catch(() => false)) { await skip.click(); continue; }
    }

    const next = dialog.getByRole("button", { name: "继续", exact: true });
    if (await next.isVisible().catch(() => false)) { await next.click(); continue; }

    const masked = dialog.getByRole("button", { name: "已遮好" });
    if (await masked.isVisible().catch(() => false)) { await masked.click(); continue; }

    await sleep(400);
  }
  return false;
}

/** 当前点名页点的是谁（只认「请把手机交给 X」整句，避免把「交给下一位」当成人名）。 */
async function currentHandoffName(page: Page, names: readonly string[]): Promise<string | null> {
  const dialog = page.locator(".mutual-mask");
  if (!(await dialog.isVisible().catch(() => false))) return null;
  const h2 = ((await dialog.locator("h2").textContent().catch(() => "")) ?? "").trim();
  return names.find((name) => h2 === `请把手机交给 ${name}`) ?? null;
}

/** 面板停在「交给下一位 / 交还主持人」时先推进到点名页。 */
async function advanceHandoffPanel(page: Page): Promise<boolean> {
  const dialog = page.locator(".mutual-mask");
  const h2 = ((await dialog.locator("h2").textContent().catch(() => "")) ?? "").trim();
  if (!/交给下一位|交还主持人/.test(h2)) return false;
  const next = dialog.getByRole("button", { name: "继续", exact: true });
  if (await next.isVisible().catch(() => false)) { await next.click(); return true; }
  return false;
}

/**
 * 按剧本走完一次完整互选：不依赖点名顺序，每次从点名页 h2 解析当前玩家再按其剧本选择。
 * 返回实际走完的玩家顺序。
 */
async function playMutualRound(
  page: Page,
  scenario: Scenario,
  onSelectShot: () => Promise<void>,
  /** 某人点中目标（提交前）留证：用于证明被拦 pair 的双方确实互相选中过。 */
  onAfterPick?: (name: string) => Promise<void>,
): Promise<string[]> {
  const dialog = page.locator(".mutual-mask");
  await dialog.waitFor({ state: "visible", timeout: 15000 });
  const played: string[] = [];
  const remaining = new Set<string>(scenario.names);
  let shotDone = false;

  for (let guard = 0; guard < scenario.names.length + 4 && remaining.size > 0; guard += 1) {
    if (await advanceHandoffPanel(page)) continue;
    const name = await currentHandoffName(page, scenario.names);
    if (!name || !remaining.has(name)) break;
    remaining.delete(name);
    played.push(name);
    const target = scenario.plan[name] ?? null;
    // 第一位真正进入选择页的玩家留一张互选现场图（结果页出图前证明「私密选择题」确实存在）。
    const wantShot = !shotDone && target !== null;
    await playOnePerson(
      page,
      name,
      target,
      wantShot ? async () => { shotDone = true; await onSelectShot(); } : undefined,
      target !== null && onAfterPick ? async () => { await onAfterPick(name); } : undefined,
    );
  }
  return played;
}

/* ------------------------------------------------------------------ */
/* 单机全流程                                                           */
/* ------------------------------------------------------------------ */

/**
 * 组局 → 开局 → 落库自检，返回 session id。4p/5p 与 D5 边界多检查点共用同一段。
 * 不改业务代码、不重装、不删手机数据（首页残留的未完成局走应用内「结束」收掉）。
 */
async function setupGame(page: Page, scenario: Scenario, steps: StepLog[]): Promise<string> {
  await timed(steps, "回首页", async () => {
    await page.goto(`${APP_URL}/`, { waitUntil: "domcontentloaded" });
    await page.locator(".home-primary").waitFor({ state: "visible", timeout: 20000 });
  });

  // 首页若残留“继续上一局”（上一轮跑局留下的未完成局），先走应用内正常流程收掉它，
  // 否则首页玩法卡会走「同一 Session 内切包」而不是新组局。不删除任何数据。
  if (await page.locator(".resume-session").isVisible().catch(() => false)) {
    await timed(steps, "收掉上一局的未完成 Session（应用内「结束」流程，不删数据）", async () => {
      await page.locator(".resume-session a").click();
      await page.waitForURL(/\/(game|generating)\?session=/, { timeout: 20000 });
      if (/\/generating\?session=/.test(page.url())) {
        await page.getByRole("button", { name: "使用本地题库开始" }).click({ timeout: 30000 });
        await page.waitForURL(/\/game\?session=/, { timeout: 30000 });
      }
      await page.locator(".round-action--complete, .round-header__end").first().waitFor({ state: "visible", timeout: 20000 });
      await finishCurrentSession(page);
    });
  }

  await timed(steps, "选玩法卡·真心话大冒险（mainline/REL 玩法，保证 9 轮计入检查点）", async () => {
    await page.locator(".mode-grid a", { hasText: "真心话大冒险" }).first().click();
    await page.waitForURL(/\/setup\?pack=truth-dare/, { timeout: 20000 });
  });

  // setup 会异步套用「上次设置」的玩家列表；等它落地再改人数，避免被回写覆盖。
  await timed(steps, "组局：等上次设置套用完成", async () => {
    await page.locator(".stepper").waitFor({ state: "visible", timeout: 15000 });
    await page.locator(".quick-start-banner").waitFor({ state: "visible", timeout: 4000 }).catch(() => undefined);
    await sleep(800);
  });

  await timed(steps, `组局：人数调到 ${scenario.names.length}`, async () => {
    for (let i = 0; i < 14; i += 1) {
      const text = (await page.locator(".stepper strong").innerText()).replace(/\D/g, "");
      const count = Number(text);
      if (count === scenario.names.length) {
        await sleep(400);
        const recheck = Number((await page.locator(".stepper strong").innerText()).replace(/\D/g, ""));
        if (recheck === scenario.names.length) return;
        continue;
      }
      await page.getByRole("button", { name: count > scenario.names.length ? "减少玩家" : "增加玩家" }).click();
      await sleep(120);
    }
    throw new Error(`人数未调到 ${scenario.names.length}`);
  });

  await timed(steps, `组局：填 ${scenario.names.length} 个昵称`, async () => {
    for (let i = 0; i < scenario.names.length; i += 1) {
      const input = page.getByLabel(`玩家 ${i + 1} 昵称`);
      await input.fill(scenario.names[i]);
      await input.blur();
    }
  });

  await timed(steps, `组局：设性别 ${scenario.genders.join("/")}`, async () => {
    for (let i = 0; i < scenario.genders.length; i += 1) {
      const group = page.getByRole("group", { name: `玩家 ${i + 1} 性别（可留空）` });
      await group.getByRole("button", { name: scenario.genders[i], exact: true }).click();
    }
  });

  await timed(steps, "组局：尺度调到 5（保证 truth-dare 走满 9 个有效轮）", async () => {
    const slider = page.getByLabel("游戏强度");
    await slider.fill("5");
    const value = await slider.inputValue();
    if (value !== "5") throw new Error(`强度未设为 5，实际 ${value}`);
  });

  await timed(steps, "下一步 → 雷区设置", async () => {
    await page.getByRole("button", { name: /下一步：雷区设置/ }).click();
    await page.waitForURL(/\/boundaries/, { timeout: 20000 });
  });

  await timed(steps, "下一步 → 生成游戏", async () => {
    await page.getByRole("button", { name: /下一步：生成游戏/ }).click();
    await page.waitForURL(/\/generating/, { timeout: 20000 });
  });

  await timed(steps, "开局：使用本地题库开始", async () => {
    const local = page.getByRole("button", { name: "使用本地题库开始" });
    const gameCard = page.locator(".game-card");
    // 未配 AI Key 走 recovery 分支；若已配好则可能直接生成进主局。
    await Promise.race([
      local.waitFor({ state: "visible", timeout: 30000 }),
      gameCard.waitFor({ state: "visible", timeout: 30000 }),
    ]);
    if (await local.isVisible().catch(() => false)) await local.click();
    await page.waitForURL(/\/game\?session=/, { timeout: 30000 });
    await gameCard.waitFor({ state: "visible", timeout: 30000 });
  });

  const sessionId = sessionIdFromUrl(page);
  if (!sessionId) throw new Error("拿不到 session id");

  await timed(steps, `开局自检：${scenario.names.length} 人 / ${scenario.title} / single 模式`, async () => {
    const s = (await readSession(page, sessionId)) as SessionSnapshot | null;
    if (!s) throw new Error("session 未落库");
    const cfg = s.config;
    const parts = s.participants ?? [];
    const names = cfg.players.map((p) => p.displayName);
    const genders = parts.map((p) => p.pairGender);
    const expectMale = scenario.genders.filter((g) => g === "男").length;
    const expectFemale = scenario.genders.filter((g) => g === "女").length;
    console.log(`    玩家=${names.join(",")} 性别=${genders.join(",")} mode=${cfg.mode} intensity=${cfg.intensity}`);
    if (names.length !== scenario.names.length) throw new Error(`人数应为 ${scenario.names.length}，实际 ${names.length}`);
    if (names.join(",") !== scenario.names.join(",")) throw new Error(`昵称不符：${names.join(",")}`);
    if (genders.filter((g) => g === "male").length !== expectMale || genders.filter((g) => g === "female").length !== expectFemale) {
      throw new Error(`性别应为 ${expectMale}男${expectFemale}女，实际 ${genders.join(",")}`);
    }
    if (cfg.mode !== "single") throw new Error(`模式应为 single，实际 ${cfg.mode}`);
    steps[steps.length - 1].note = `players=${names.join("/")} genders=${genders.join("/")}`;
  });

  return sessionId;
}

async function runDevice(dev: DeviceSpec, scenario: Scenario): Promise<RunReport> {
  const steps: StepLog[] = [];
  const files: string[] = [];
  const blockers: string[] = [];
  const roundTimings: number[] = [];
  const report: RunReport = {
    device: dev.label,
    serial: dev.serial,
    scenario: scenario.id,
    scenarioTitle: scenario.title,
    channel: "WebView CDP (Playwright connectOverCDP)",
    reachStep: "未开始",
    roundsCompleted: 0,
    roundTimings,
    avgRoundMs: null,
    mutualCheckpoint: null,
    mutualAppeared: false,
    matchRecorded: null,
    matchCount: 0,
    perPlayerMatchCounts: {},
    resultPageText: null,
    screenshots: files,
    blockers,
    steps,
  };
  const sid = scenario.id;

  let browser: Browser | undefined;
  try {
    browser = await timed(steps, "CDP 连接", () => chromium.connectOverCDP(dev.endpoint, { timeout: 15000 }));
    const ctx = browser.contexts()[0];
    const page = ctx.pages()[0];
    page.setDefaultTimeout(25000);
    console.log(`  页面: ${page.url()}`);
    await assertWebViewAlive(page, steps);

    /* ---------- 1. 组局 ---------- */
    report.reachStep = "组局";
    const sessionId = await setupGame(page, scenario, steps);
    console.log(`  session=${sessionId}`);

    report.reachStep = "主局";
    await shot(page, `${sid}-1-main`, files);

    /* ---------- 2. 连点 9 轮 ---------- */
    report.reachStep = "连点轮次";
    const completeBtn = page.locator(".round-action--complete");
    let mutualVisible = false;

    for (let round = 1; round <= ROUND_HARD_CAP; round += 1) {
      if (await page.locator(".mutual-mask").isVisible().catch(() => false)) { mutualVisible = true; break; }
      await completeBtn.waitFor({ state: "visible", timeout: 20000 });
      // 禁用态（暂停/动画中）等一会儿
      for (let w = 0; w < 20 && (await completeBtn.isDisabled().catch(() => true)); w += 1) await sleep(250);

      const label = (await completeBtn.innerText().catch(() => "")).trim();
      const t0 = Date.now();
      await completeBtn.click({ timeout: 10000 });
      // 等本轮真正落库，避免点到旧卡
      const deadline = Date.now() + 15000;
      let persisted = false;
      while (Date.now() < deadline) {
        if (await page.locator(".mutual-mask").isVisible().catch(() => false)) { mutualVisible = true; break; }
        const s = (await readSession(page, sessionId)) as SessionSnapshot | null;
        const done = (s?.rounds ?? []).filter((r) => r.status === "completed").length;
        if (done >= round) { persisted = true; break; }
        await sleep(120);
      }
      const ms = Date.now() - t0;
      roundTimings.push(ms);
      report.roundsCompleted = round;
      console.log(`    轮 ${round}: 主按钮=「${label}」 落库耗时 ${ms}ms${persisted ? "" : "（未确认落库）"}`);
      if (mutualVisible) break;
      if (!persisted) { blockers.push(`第 ${round} 轮未在 15s 内确认落库`); break; }
    }

    /* ---------- 3. 断言私密互选 dialog ---------- */
    report.mutualAppeared = mutualVisible || (await page.locator(".mutual-mask").isVisible().catch(() => false));
    if (!report.mutualAppeared) {
      blockers.push(`走完 ${report.roundsCompleted} 轮仍未出现私密互选 dialog`);
      report.reachStep = "主局（互选未弹）";
      return report;
    }
    const rel = (await readSession(page, sessionId)) as SessionSnapshot | null;
    report.mutualCheckpoint = rel?.relationshipState?.relationshipEffectiveCardCount ?? null;
    console.log(`    ✓ 私密互选 dialog 出现（effective=${report.mutualCheckpoint}，完成 ${report.roundsCompleted} 轮）`);
    steps.push({ step: "断言私密互选 dialog 出现", ms: 0, note: `completed=${report.roundsCompleted} effective=${report.mutualCheckpoint}` });
    if (report.mutualCheckpoint !== MUTUAL_CHECK_TARGET_ROUNDS) {
      blockers.push(`互选检查点应为 ${MUTUAL_CHECK_TARGET_ROUNDS}，实际 ${report.mutualCheckpoint}`);
    }

    /* ---------- 4. 按剧本走完互选 ---------- */
    report.reachStep = "互选";
    let playedOrder: string[] = [];
    await timed(steps, `互选：按剧本走完 ${scenario.names.length} 人（含互选现场截图）`, async () => {
      playedOrder = await playMutualRound(page, scenario, async () => { await shot(page, `${sid}-2-mutual`, files); });
    });
    if (playedOrder.length !== scenario.names.length) {
      blockers.push(`互选点名人数不符：应 ${scenario.names.length} 人，实际 ${playedOrder.length}（${playedOrder.join(",")}）`);
    }
    steps[steps.length - 1].note = `order=${playedOrder.join("→")}`;

    // 结果页
    const resultDialog = page.locator(".mutual-mask");
    await resultDialog.getByRole("heading", { name: "互选成功" }).waitFor({ state: "visible", timeout: 15000 });
    const resultItems = await resultDialog.locator(".mutual-result li").allInnerTexts();
    const matchTexts = resultItems.map((t) => t.trim()).filter(Boolean);
    report.resultPageText = matchTexts.join(" | ");
    console.log(`    结果页：互选成功 · ${report.resultPageText}`);

    const expectedPairs = scenario.expectedPairs.map(([a, b]) => normalizePair(a, b)).sort();
    const actualPairs = matchTexts
      .map((t) => {
        const [a, b] = t.split("×").map((s) => s.trim());
        return a && b ? normalizePair(a, b) : t;
      })
      .sort();
    if (actualPairs.length !== expectedPairs.length || actualPairs.join(",") !== expectedPairs.join(",")) {
      blockers.push(`结果页 MATCH 不符：期望 ${expectedPairs.join(",")}，实际 ${actualPairs.join(",")}`);
    }
    report.matchCount = actualPairs.length;
    await shot(page, `${sid}-3-result`, files);

    /* ---------- 5. 收束回主局 + MATCH 落盘断言（含 D5 上限逐人计数） ---------- */
    report.reachStep = "结果→主局";
    await timed(steps, "点“继续游戏”收束", async () => {
      await resultDialog.getByRole("button", { name: "继续游戏" }).click();
      await page.locator(".round-action--complete").waitFor({ state: "visible", timeout: 20000 });
    });

    await timed(steps, `断言 MATCH 落盘 + D5 上限（每人 ≤ ${MAX_ACTIVE_MATCHES_PER_PLAYER}）`, async () => {
      const s = (await readSession(page, sessionId)) as SessionSnapshot | null;
      if (!s) throw new Error("收束后 session 读不到");
      const nameOf = (id: string) => s.config.players.find((p) => p.id === id)?.displayName ?? id;
      const completed = s.rounds.filter((r) => r.status === "completed").length;
      const matches = Object.values(s.relationshipState?.matches ?? {}).map((m) => [...m.playerIds].sort().map(nameOf).join("×"));
      const perPlayer: Record<string, number> = {};
      for (const match of Object.values(s.relationshipState?.matches ?? {})) {
        if (match.playerIds.length !== 2 || match.playerIds[0] === match.playerIds[1]) {
          throw new Error(`MATCH 配对非法：${JSON.stringify(match.playerIds)}`);
        }
        for (const id of match.playerIds) {
          const who = nameOf(id);
          perPlayer[who] = (perPlayer[who] ?? 0) + 1;
        }
      }
      report.matchRecorded = matches;
      report.perPlayerMatchCounts = perPlayer;
      console.log(`    completed=${completed} matches=${JSON.stringify(matches)} 每人=${JSON.stringify(perPlayer)}`);
      if (completed < report.roundsCompleted) throw new Error("完成后轮次计数回退");
      if (matches.length !== expectedPairs.length) throw new Error(`MATCH 应恰好 ${expectedPairs.length} 对，实际 ${matches.length}`);
      const unique = new Set(matches);
      if (unique.size !== matches.length) throw new Error(`出现重复 MATCH：${matches.join(",")}`);
      const over = Object.entries(perPlayer).filter(([, count]) => count > MAX_ACTIVE_MATCHES_PER_PLAYER);
      if (over.length) throw new Error(`D5 上限被突破：${over.map(([n, c]) => `${n}×${c}`).join(",")}`);
      steps[steps.length - 1].note = `completed=${completed} matches=${matches.join(",")} perPlayer=${JSON.stringify(perPlayer)}`;
    });

    await shot(page, `${sid}-4-after`, files);

    // 收局（应用内正常流程）：走完下一轮的旁证已留存，再结束本局便于下一次干净复跑。
    await timed(steps, "收局：顶栏「结束」→ 总结页（不删数据）", async () => {
      await finishCurrentSession(page);
    });

    report.reachStep = "完成（回到主局）";
    return report;
  } catch (error) {
    blockers.push(`异常中断：${(error as Error).message.split("\n")[0]}`);
    report.reachStep = `${report.reachStep}（中断）`;
    // 尽力留一张现场图
    try {
      const page = browser?.contexts()[0]?.pages()[0];
      if (page) await shot(page, `${sid}-err-${Date.now()}`, files);
    } catch { /* 截图失败不掩盖原错误 */ }
    return report;
  } finally {
    report.roundTimings = roundTimings;
    report.avgRoundMs = roundTimings.length ? Math.round(roundTimings.reduce((a, b) => a + b, 0) / roundTimings.length) : null;
    await browser?.close().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* D5 上限边界：一次 Session 内连跑 9/14/19 三个常规互选                 */
/* ------------------------------------------------------------------ */

/** 把结果页的「A × B」文案归一化成排序后的 a×b。 */
function normalizePairText(text: string): string | null {
  const [a, b] = text.split("×").map((s) => s.trim());
  if (!a || !b) return null;
  return normalizePair(a, b);
}

/** 结果页 + 落盘快照（姓名对 / 原生 id 对 / 逐人计数）。 */
async function readMatchSnapshot(page: Page, sessionId: string) {
  const s = (await readSession(page, sessionId)) as SessionSnapshot | null;
  if (!s) return null;
  const players = s.config.players;
  const nameOf = (id: string) => players.find((p) => p.id === id)?.displayName ?? id;
  const raw = Object.values(s.relationshipState?.matches ?? {});
  const pairsById = raw.map((m) => [...m.playerIds].sort());
  const matchList = raw.map((m) => [...m.playerIds].sort().map(nameOf).join("×")).sort();
  const perPlayer: Record<string, number> = {};
  for (const m of raw) for (const id of m.playerIds) { const n = nameOf(id); perPlayer[n] = (perPlayer[n] ?? 0) + 1; }
  return {
    matchList,
    pairsById,
    perPlayer,
    players,
    completed: (s.rounds ?? []).filter((r) => r.status === "completed").length,
    effective: s.relationshipState?.relationshipEffectiveCardCount ?? null,
    regularMutualCheckRuns: s.relationshipState?.regularMutualCheckRuns ?? 0,
    lastMutualCheckAtEffectiveCount: s.relationshipState?.lastMutualCheckAtEffectiveCount ?? null,
  };
}

/** 轮询到累计 MATCH 数等于期望值（最多 8s）。 */
async function waitForMatchCount(page: Page, sessionId: string, expected: number) {
  const deadline = Date.now() + 8000;
  let snap = await readMatchSnapshot(page, sessionId);
  while (Date.now() < deadline && (snap?.matchList.length ?? -1) !== expected) {
    await sleep(200);
    snap = await readMatchSnapshot(page, sessionId);
  }
  return snap;
}

/**
 * 互选收束是异步 commit：先等 `regularMutualCheckRuns` 达到期望值，再按累计 MATCH 数复核。
 *
 * 为什么不能只用「累计 MATCH 数」做同步点：被上限拦下的检查点里 MATCH 数不变
 * （2 → 2），按数量轮询会立刻返回、在落盘前就断言，造成假 PASS。
 * DUE 计数与本次 MATCH 在同一次 commit 里原子写入，因此它是收束已落盘的可靠信号。
 */
async function waitForMutualSettled(page: Page, sessionId: string, expectedRuns: number, expectedMatches: number) {
  const deadline = Date.now() + 10000;
  let snap = await readMatchSnapshot(page, sessionId);
  while (Date.now() < deadline && (snap?.regularMutualCheckRuns ?? -1) < expectedRuns) {
    await sleep(200);
    snap = await readMatchSnapshot(page, sessionId);
  }
  const dueConfirmed = (snap?.regularMutualCheckRuns ?? -1) >= expectedRuns;
  if (!dueConfirmed) return { snap, dueConfirmed };
  return { snap: await waitForMatchCount(page, sessionId, expectedMatches), dueConfirmed };
}

/**
 * 受控打开加玩开关（RG-05「经参与者知情同意的受控路径」）。
 * 现状：`EXTENSION_ACTIVATED_BY_HOST` 只存在于 reducer/类型，生产 UI 未接线
 * （全仓无 dispatch 点），第 3 次常规互选（检查点 19）在真机上无法自然触发。
 * 这里只改本地 Session 归档里的一个布尔，不删任何数据、不动业务代码。
 */
async function seedExtensionActivated(page: Page, id: string) {
  return page.evaluate(`(() => new Promise((resolve, reject) => {
    const req = indexedDB.open("party-night-v1", 2);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("sessions", "readwrite");
      const store = tx.objectStore("sessions");
      const get = store.get(${JSON.stringify(id)});
      get.onerror = () => { db.close(); reject(get.error); };
      get.onsuccess = () => {
        const row = get.result;
        if (!row || !row.relationshipState) { db.close(); reject(new Error("session 无 relationshipState")); return; }
        row.relationshipState.extensionActivated = true;
        const put = store.put(row);
        put.onerror = () => { db.close(); reject(put.error); };
        put.onsuccess = () => { db.close(); resolve(true); };
      };
    };
  }))()`);
}

/** 连点主按钮直到私密互选 dialog 出现；返回本次已确认落库的 completed 轮数。 */
async function clickRoundsUntilMutual(
  page: Page,
  sessionId: string,
  fromCompleted: number,
  timings: number[],
): Promise<{ visible: boolean; completed: number }> {
  const completeBtn = page.locator(".round-action--complete");
  let completed = fromCompleted;
  for (let round = fromCompleted + 1; round <= ROUND_HARD_CAP; round += 1) {
    if (await page.locator(".mutual-mask").isVisible().catch(() => false)) return { visible: true, completed };
    await completeBtn.waitFor({ state: "visible", timeout: 20000 });
    for (let w = 0; w < 20 && (await completeBtn.isDisabled().catch(() => true)); w += 1) await sleep(250);

    const label = (await completeBtn.innerText().catch(() => "")).trim();
    const t0 = Date.now();
    await completeBtn.click({ timeout: 10000 });
    // 等本轮真正落库（或互选弹出），避免点到旧卡
    const deadline = Date.now() + 15000;
    let persisted = false;
    while (Date.now() < deadline) {
      if (await page.locator(".mutual-mask").isVisible().catch(() => false)) return { visible: true, completed };
      const s = (await readSession(page, sessionId)) as SessionSnapshot | null;
      const done = (s?.rounds ?? []).filter((r) => r.status === "completed").length;
      if (done > completed) { completed = done; persisted = true; break; }
      await sleep(120);
    }
    timings.push(Date.now() - t0);
    console.log(`    轮 ${round}: 主按钮=「${label}」 落库 ${Date.now() - t0}ms${persisted ? "" : "（未确认落库）"}`);
    if (!persisted) break;
  }
  return { visible: await page.locator(".mutual-mask").isVisible().catch(() => false), completed };
}

async function runD5CapDevice(dev: DeviceSpec, scenario: Scenario): Promise<RunReport> {
  const stages = scenario.stages ?? [];
  const steps: StepLog[] = [];
  const files: string[] = [];
  const blockers: string[] = [];
  const roundTimings: number[] = [];
  const stageEvidence: StageEvidence[] = [];
  const started = Date.now();
  const report: RunReport = {
    device: dev.label,
    serial: dev.serial,
    scenario: scenario.id,
    scenarioTitle: scenario.title,
    channel: "WebView CDP (Playwright connectOverCDP)",
    reachStep: "未开始",
    roundsCompleted: 0,
    roundTimings,
    avgRoundMs: null,
    mutualCheckpoint: null,
    mutualAppeared: false,
    matchRecorded: null,
    matchCount: 0,
    perPlayerMatchCounts: {},
    resultPageText: null,
    screenshots: files,
    blockers,
    steps,
    stageEvidence,
  };
  const sid = scenario.id;
  let browser: Browser | undefined;
  try {
    browser = await timed(steps, "CDP 连接", () => chromium.connectOverCDP(dev.endpoint, { timeout: 15000 }));
    const ctx = browser.contexts()[0];
    const page = ctx.pages()[0];
    page.setDefaultTimeout(25000);
    console.log(`  页面: ${page.url()}`);
    await assertWebViewAlive(page, steps);

    report.reachStep = "组局";
    const sessionId = await setupGame(page, scenario, steps);
    console.log(`  session=${sessionId}`);
    report.reachStep = "主局";
    await shot(page, `${sid}-1-main`, files);

    let roundsDone = 0;
    for (let stageIndex = 0; stageIndex < stages.length; stageIndex += 1) {
      const stage = stages[stageIndex]!;
      const stageShots: string[] = [];
      report.reachStep = `互选检查点 ${stage.checkpoint}`;

      if (stage.activateExtensionBefore) {
        await timed(steps, `检查点 ${stage.checkpoint}：受控打开加玩（extensionActivated=true，生产 UI 未接线）`, async () => {
          await seedExtensionActivated(page, sessionId);
          await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
          if (!/\/game\?session=/.test(page.url())) throw new Error(`重载后不在主局：${page.url()}`);
          await page.locator(".round-action--complete").waitFor({ state: "visible", timeout: 30000 });
        });
      }

      const advance = await timed(steps, `检查点 ${stage.checkpoint}：连点主按钮到私密互选弹出`, async () =>
        clickRoundsUntilMutual(page, sessionId, roundsDone, roundTimings));
      roundsDone = advance.completed;
      if (!advance.visible) {
        blockers.push(`检查点 ${stage.checkpoint}：连点到第 ${roundsDone} 轮仍未出现互选 dialog`);
        report.reachStep = `${report.reachStep}（未弹出）`;
        break;
      }

      const preSnap = await readMatchSnapshot(page, sessionId);
      const effective = preSnap?.effective ?? null;
      const atCheckpoint = preSnap?.completed ?? roundsDone;
      report.mutualAppeared = true;
      report.mutualCheckpoint = stage.checkpoint;
      console.log(`    ✓ 检查点 ${stage.checkpoint} 互选弹出（completed=${atCheckpoint} effective=${effective}）`);
      steps.push({ step: `断言检查点 ${stage.checkpoint} 互选弹出`, ms: 0, note: `completed=${atCheckpoint} effective=${effective}` });
      if (effective !== stage.checkpoint) blockers.push(`检查点应为 ${stage.checkpoint}，实际 effective=${effective}`);

      /* 按剧本走完互选（含现场截图） */
      const stageScenario: Scenario = { ...scenario, plan: stage.plan, expectedPairs: stage.expectedPublicPairs };
      const played = await timed(steps, `检查点 ${stage.checkpoint}：按剧本走完 ${scenario.names.length} 人互选`, async () =>
        playMutualRound(page, stageScenario, async () => {
          const p = join(OUT_DIR, `${sid}-c${stage.checkpoint}-2-mutual.png`);
          await page.screenshot({ path: p, timeout: 40000 });
          files.push(p); stageShots.push(p);
          console.log(`    📸 ${p}`);
        }, async (name) => {
          // 选中高亮、尚未提交（提交后不回显）：证明该人确实选了 TA。
          const p = join(OUT_DIR, `${sid}-c${stage.checkpoint}-2b-pick-${name}.png`);
          await page.screenshot({ path: p, timeout: 40000 });
          files.push(p); stageShots.push(p);
          console.log(`    📸 ${p}`);
        }));
      if (played.length !== scenario.names.length) {
        blockers.push(`检查点 ${stage.checkpoint} 点名人数不符：应 ${scenario.names.length}，实际 ${played.length}（${played.join(",")}）`);
      }

      /* 结果页：公开结果 + 被拦 pair 零痕迹 */
      const dialog = page.locator(".mutual-mask");
      await dialog.getByRole("heading", { name: /互选成功|本轮已完成/ }).waitFor({ state: "visible", timeout: 15000 });
      const resultHeading = (((await dialog.locator("h2").first().textContent().catch(() => "")) ?? "") as string).trim();
      const publicPairs = (await dialog.locator(".mutual-result li").allInnerTexts())
        .map((t) => normalizePairText(t.trim()))
        .filter((v): v is string => Boolean(v))
        .sort();
      const expectPublic = stage.expectedPublicPairs.map(([a, b]) => normalizePair(a, b)).sort();
      report.resultPageText = publicPairs.join(" | ");
      console.log(`    检查点 ${stage.checkpoint} 结果页：${publicPairs.join(" | ") || "（无公布）"}`);
      if (publicPairs.join(",") !== expectPublic.join(",")) {
        blockers.push(`检查点 ${stage.checkpoint} 结果页不符：期望 ${expectPublic.join(",") || "（无）"}，实际 ${publicPairs.join(",") || "（无）"}`);
      }
      // 零公布时标题必须是「本轮已完成，继续游戏」——界面不给任何人「这次互选成了/没成」的暗示。
      if (expectPublic.length === 0 && !/本轮已完成/.test(resultHeading)) {
        blockers.push(`检查点 ${stage.checkpoint}：期望零公布（标题「本轮已完成」），实际标题「${resultHeading}」`);
      }
      if (expectPublic.length > 0 && !/互选成功/.test(resultHeading)) {
        blockers.push(`检查点 ${stage.checkpoint}：期望有公布（标题「互选成功」），实际标题「${resultHeading}」`);
      }
      const dialogText = (await dialog.innerText().catch(() => "")) ?? "";
      // 界面无痕：被拦 pair 不得出现在公开结果里（触顶方可能合法出现在别的已成立 pair 中，
      // 因此只认「被拦的那一对」，不因出现单个姓名就误判泄露）。
      const leakedPairs = (stage.blockedPairs ?? [])
        .map(([a, b]) => ({ a, b, pair: normalizePair(a, b) }))
        .filter(({ pair }) => publicPairs.includes(pair));
      if (leakedPairs.length) {
        blockers.push(`检查点 ${stage.checkpoint}：被上限拦下的 pair 出现在结果页：${leakedPairs.map((x) => x.pair).join(",")}`);
      }
      const capCopy = /上限|已满|名额|触顶|达到了/.test(dialogText);
      if (capCopy) blockers.push(`检查点 ${stage.checkpoint}：结果页出现上限相关文案（应零痕迹）`);
      const resultShot = join(OUT_DIR, `${sid}-c${stage.checkpoint}-3-result.png`);
      await page.screenshot({ path: resultShot, timeout: 40000 });
      files.push(resultShot); stageShots.push(resultShot);
      console.log(`    📸 ${resultShot}`);

      /* 收束回主局 + 落盘断言 */
      await timed(steps, `检查点 ${stage.checkpoint}：点「继续游戏」收束回主局`, async () => {
        await dialog.getByRole("button", { name: "继续游戏" }).click();
        await page.locator(".round-action--complete").waitFor({ state: "visible", timeout: 20000 });
      });

      const settled = await waitForMutualSettled(page, sessionId, stageIndex + 1, stage.expectedTotalMatches);
      const snap = settled.snap;
      if (!settled.dueConfirmed) {
        blockers.push(
          `检查点 ${stage.checkpoint}：收束后 regularMutualCheckRuns 未增至 ${stageIndex + 1}（实际 ${snap?.regularMutualCheckRuns ?? "读不到"}），互选收束未确认落盘`,
        );
      }
      const blockedZeroTrace: string[] = [];
      if (!snap) {
        blockers.push(`检查点 ${stage.checkpoint}：收束后读不到 session`);
      } else {
        if (snap.completed) roundsDone = snap.completed;
        const over = Object.entries(snap.perPlayer).filter(([, c]) => c > MAX_ACTIVE_MATCHES_PER_PLAYER);
        if (over.length) blockers.push(`检查点 ${stage.checkpoint}：D5 上限被突破 ${over.map(([n, c]) => `${n}×${c}`).join(",")}`);
        if (snap.matchList.length !== stage.expectedTotalMatches) {
          blockers.push(`检查点 ${stage.checkpoint}：累计 MATCH 应 ${stage.expectedTotalMatches} 对，实际 ${snap.matchList.length}（${snap.matchList.join(",")}）`);
        }
        for (const [a, b] of stage.blockedPairs ?? []) {
          const pair = normalizePair(a, b);
          const ids = [a, b].map((n) => snap.players.find((p) => p.displayName === n)?.id).filter((v): v is string => Boolean(v));
          const asMatch = snap.matchList.includes(pair)
            || snap.pairsById.some((pairIds) => ids.length === 2 && ids.every((id) => pairIds.includes(id)));
          if (asMatch) blockers.push(`检查点 ${stage.checkpoint}：被拦 pair ${pair} 竟然落了 MATCH（应零创建）`);
          blockedZeroTrace.push(pair);
        }
        report.matchCount = snap.matchList.length;
        report.matchRecorded = snap.matchList;
        report.perPlayerMatchCounts = snap.perPlayer;
        report.roundsCompleted = snap.completed;
        console.log(`    检查点 ${stage.checkpoint} 落盘：MATCH=${snap.matchList.length} ${JSON.stringify(snap.matchList)} 每人=${JSON.stringify(snap.perPlayer)}`);
        steps.push({
          step: `检查点 ${stage.checkpoint} 落盘断言`,
          ms: 0,
          note: `MATCH=${snap.matchList.join(",") || "（无）"} perPlayer=${JSON.stringify(snap.perPlayer)} 被拦零痕迹=${blockedZeroTrace.join(",") || "（无）"}`,
        });
      }

      const afterShot = join(OUT_DIR, `${sid}-c${stage.checkpoint}-4-after.png`);
      await page.screenshot({ path: afterShot, timeout: 40000 });
      files.push(afterShot); stageShots.push(afterShot);
      console.log(`    📸 ${afterShot}`);

      stageEvidence.push({
        checkpoint: stage.checkpoint,
        roundsAtCheckpoint: atCheckpoint,
        effectiveAtCheckpoint: effective,
        publicPairs,
        resultHeading,
        blockedPairsZeroTrace: blockedZeroTrace,
        capCopyOnResultPage: capCopy,
        totalMatchesAfter: snap?.matchList.length ?? -1,
        matchListAfter: snap?.matchList ?? [],
        perPlayerAfter: snap?.perPlayer ?? {},
        extensionSeeded: Boolean(stage.activateExtensionBefore),
        screenshots: stageShots,
      });
    }

    report.reachStep = "结果→主局";
    await shot(page, `${sid}-5-final-main`, files);
    // 收局（应用内正常流程）：全部证据已留存，再结束本局便于下一次干净复跑。
    await timed(steps, "收局：顶栏「结束」→ 总结页（不删数据）", async () => {
      await finishCurrentSession(page);
    });

    report.reachStep = "完成（回到主局）";
    return report;
  } catch (error) {
    blockers.push(`异常中断：${(error as Error).message.split("\n")[0]}`);
    report.reachStep = `${report.reachStep}（中断）`;
    try {
      const page = browser?.contexts()[0]?.pages()[0];
      if (page) await shot(page, `${sid}-err-${Date.now()}`, files);
    } catch { /* 截图失败不掩盖原错误 */ }
    return report;
  } finally {
    report.roundTimings = roundTimings;
    report.avgRoundMs = roundTimings.length ? Math.round(roundTimings.reduce((a, b) => a + b, 0) / roundTimings.length) : null;
    console.log(`    单机总耗时 ${Math.round((Date.now() - started) / 1000)}s`);
    await browser?.close().catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* 入口                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const which = process.argv[2] ?? "all";
  const scenarioArg = process.argv[3];
  if (scenarioArg && !SCENARIOS[scenarioArg]) throw new Error(`未知场景：${scenarioArg}`);
  const targets = which === "all" ? DEVICES : DEVICES.filter((d) => d.label === which);
  if (!targets.length) throw new Error(`未知设备：${which}`);

  const reports: RunReport[] = [];
  for (const dev of targets) {
    const scenario = SCENARIOS[scenarioArg ?? dev.scenario]!;
    console.log(`\n================ ${dev.label} (${dev.serial}) · 场景 ${scenario.id}（${scenario.title}） ================`);
    reports.push(scenario.stages ? await runD5CapDevice(dev, scenario) : await runDevice(dev, scenario));
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outFile = join(OUT_DIR, `run-report-${stamp}.json`);
  writeFileSync(outFile, JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2), "utf8");

  console.log("\n================ 汇总 ================");
  for (const r of reports) {
    console.log(
      `${r.device} [${r.scenario} ${r.scenarioTitle}]: 走到「${r.reachStep}」| 有效轮数=${r.roundsCompleted}` +
      ` | 互选=${r.mutualAppeared ? `出现(检查点 ${r.mutualCheckpoint})` : "未出现"}` +
      ` | MATCH=${r.matchCount} ${JSON.stringify(r.matchRecorded)} | 每人=${JSON.stringify(r.perPlayerMatchCounts)}` +
      ` | 单轮耗时=${JSON.stringify(r.roundTimings)}${r.avgRoundMs ? ` (均 ${r.avgRoundMs}ms)` : ""}`,
    );
    if (r.blockers.length) r.blockers.forEach((b) => console.log(`   ! 阻塞：${b}`));
    if (r.stageEvidence?.length) {
      for (const s of r.stageEvidence) {
        console.log(
          `   检查点 ${s.checkpoint}: 公开=${s.publicPairs.join(",") || "（无）"} | 标题=「${s.resultHeading}」 | 被拦零痕迹=${s.blockedPairsZeroTrace.join(",") || "（无）"}` +
          ` | 累计MATCH=${s.totalMatchesAfter} ${JSON.stringify(s.matchListAfter)} | 每人=${JSON.stringify(s.perPlayerAfter)}` +
          ` | 结果页上限文案=${s.capCopyOnResultPage} | 受控打开加玩=${s.extensionSeeded}`,
        );
      }
    }
    console.log(`   截图：${r.screenshots.join(" , ")}`);
  }
  console.log(`\n报告落盘：${outFile}`);
}

void main();
