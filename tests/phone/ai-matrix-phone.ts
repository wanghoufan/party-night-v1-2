/**
 * 真机 AI 全矩阵实测（WebView CDP 通道）
 * ---------------------------------------------------------------------------
 * 通道：Playwright `chromium.connectOverCDP` 直连 11T Pro+（label `11t`，USB 直连，
 *       adb serial `IN9LZTAYV4UGU4JF`，机型 22041216UC / xagapro；CDP forward 约定 tcp:9363）。
 *       【12 Pro 禁碰，勿启用】旧 dev31（adb `192.168.31.31:5555` / android_id
 *       `4ab185ebe26feae1` / 机型 22101316C）是禁碰设备，定义已删，仅此注释存档。
 *
 * 被测链路（自包含包）：手机 APP 内已配置的真实 API Key → 生成页前端直连
 *           `lib/ai/direct-provider.ts`（WebView 内 CapacitorHttp 绕 CORS → Provider
 *           `chat/completions`，分块 4 批 × 10 张、单批 45s 超时）→ 主局出卡。
 *           harness 只点 UI、只读 sessions store 的 `generationSource` 做断言
 *           （不碰 aiSecrets / aiCryptoKeys，不读、不打印、不落盘任何密钥）。
 *
 * APP origin：自包含 APK（NEXT_PUBLIC_SELF_CONTAINED=1）→ direct/native transport；
 *           真机实际 origin 由 harness 连接后读 CDP 页面 location 运行时记录（当前真机为
 *           `https://localhost/`），不写死；Mac :3000 不作为真机业务依赖（自包含包无 /api
 *           代理，生成走前端直连；:3000 仅 Mac 侧矩阵 harness 使用）。
 *
 * 矩阵：7 玩法 × 强度 {2,5} × 人数 {2,4} = 28 组。
 * 每组：走局开局（首页玩法卡 → 人数/强度 → 雷区 → 生成游戏）→ 等 AI 出卡
 *       → 断言有卡可玩 → 读 Session 的 `generationSource`（只读 sessions store，不含密钥）→ 截图 1 张 → 应用内收局退出。
 * 判定：只有 `generationSource === "ai"` 才记 AI PASS（Change B 补充；静默回退本地题库不算）。
 *
 * 约束：不改业务代码；不删手机数据；不重装包；不写死坐标（一律走 role/label/class 选择器）；
 *       相邻 AI 调用间隔 ≥ 3s；不重启 APP、不连任何 dev 服务（自包含包内前端直连）。
 *
 * 用法：
 *   npx tsx tests/phone/ai-matrix-phone.ts probe                 # 只读探测（设备/密钥就绪，不打印密钥）
 *   npx tsx tests/phone/ai-matrix-phone.ts run                   # 跑满 28 组
 *   npx tsx tests/phone/ai-matrix-phone.ts run truth-dare 5 2    # 只跑指定 [玩法] [强度] [人数]
 */
import { chromium, type Browser, type Page } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isAiGenerationSource } from "../../lib/domain/generation-source";

/* ------------------------------------------------------------------ */
/* 常量                                                                */
/* ------------------------------------------------------------------ */

/**
 * 真机目标：11T Pro+（label `11t`，USB 直连，机型 22041216UC / xagapro）。
 * CDP forward 约定（外部 preflight 负责，本 harness 不跑 adb）：
 *   adb forward tcp:9363 localabstract:webview_devtools_remote_<pid>
 *
 * 【12 Pro 禁碰，勿启用】旧 dev31 定义仅作存档（Note 12 Pro / 22101316C / android_id
 * 4ab185ebe26feae1，adb 192.168.31.31:5555，CDP 曾用 tcp:9331），禁止启用：
 *   const DEV = {
 *     label: "dev31",
 *     endpoint: "http://127.0.0.1:9331",
 *     serial: "192.168.31.31:5555",
 *     adbSerial: "192.168.31.31:5555",
 *     androidId: "4ab185ebe26feae1",
 *     model: "22101316C（Note 12 Pro）",
 *   } as const;
 */
const DEV = {
  label: "11t",
  endpoint: "http://127.0.0.1:9363",
  serial: "IN9LZTAYV4UGU4JF",
  adbSerial: "IN9LZTAYV4UGU4JF",
  model: "22041216UC（11T Pro+ / xagapro）",
} as const;

const OUT_DIR = join(process.cwd(), "test-results", "phone", "ai-matrix");
const MD_FILE = join(process.cwd(), "docs", "qa", "AI-MATRIX-PHONE.md");
const JSON_FILE = join(process.cwd(), "test-results", "phone", "ai-matrix-phone.json");

/** 相邻两次「生成游戏」调用之间的最小间隔（用户约束：≥3s）。 */
const MIN_CALL_GAP_MS = 3000;
/**
 * 从点「生成游戏」到出卡/报错的最长等待。
 * 分块生成最坏 4 批 × 45s = 180s（与 lib/ai/direct-provider.ts DECK_BATCH_TIMEOUT_MS×4 口径联动）
 * + 10s 余量；真机实测单格最慢 114s，120s 旧值会把慢成功误判 timeout。
 */
const GEN_TIMEOUT_MS = 190_000;
/** 断言可玩视图出现的最长等待。 */
const VIEW_TIMEOUT_MS = 30_000;

/**
 * 会话路由正则（统一兼容带/不带尾斜杠双形态）。
 * 自包含包 `trailingSlash: true`（next.config.ts）⇒ 真机 WebView 内路由为
 * `/game/?session=…`、`/generating/?session=…`；本地 dev 为无尾斜杠形态。
 */
const RE_GAME_SESSION = /\/game\/?\?session=/;
const RE_GENERATING_SESSION = /\/generating\/?\?session=/;
const RE_ANY_SESSION = /\/(game|generating)\/?\?session=/;

type ViewKind = "card" | "binary" | "pointing" | "compatibility" | "spin";

interface PackSpec {
  id: string;
  name: string;
  view: ViewKind;
  /** 玩法契约 minPlayers（来自 lib/game-packs/*，用于解释失败原因，不参与判定）。 */
  minPlayers: number;
}

const PACKS: readonly PackSpec[] = [
  { id: "truth-dare", name: "真心话大冒险", view: "card", minPlayers: 2 },
  { id: "most-likely", name: "谁最可能", view: "card", minPlayers: 3 },
  { id: "never-have", name: "我从来没有", view: "card", minPlayers: 2 },
  { id: "would-you-rather", name: "二选一", view: "binary", minPlayers: 2 },
  { id: "pointing-game", name: "指人游戏", view: "pointing", minPlayers: 3 },
  { id: "compatibility-test", name: "默契测试", view: "compatibility", minPlayers: 2 },
  { id: "spin-bottle", name: "转瓶子", view: "spin", minPlayers: 2 },
];
const INTENSITIES = [2, 5] as const;
const PLAYER_COUNTS = [2, 4] as const;

/** 矩阵全量格子（顺序唯一）：7 玩法 × 强度 {2,5} × 人数 {2,4} = 28。 */
const CELL_ORDER: readonly string[] = PACKS.flatMap((pack) => INTENSITIES.flatMap((intensity) => PLAYER_COUNTS.map((players) => `${pack.id}|${intensity}|${players}`)));
const TOTAL_CELLS = CELL_ORDER.length;

/**
 * 合法性格过滤（AI-MATRIX-PLAN §1 同口径）：`players < pack.minPlayers` 的格**不生成、不执行**，
 * 记为 SKIPPED-ILLEGAL（人数低于玩法 minPlayers），不算 PASS 也不算 FAIL。
 * 背景：2 人局选中 pointing-game/most-likely（minPlayers=3）时，normalize 按 pack 契约强制
 * minPlayers=3 → safety-filter 在 playerCount=2 时把这些卡全滤掉 → deck=0 → 耗尽死局（2026-09-26 第17格卡死根因）。
 */
const isLegalCell = (pack: PackSpec, players: number): boolean => players >= pack.minPlayers;
const LEGAL_CELL_ORDER: readonly string[] = PACKS.flatMap((pack) => INTENSITIES.flatMap((intensity) => PLAYER_COUNTS.filter((players) => isLegalCell(pack, players)).map((players) => `${pack.id}|${intensity}|${players}`)));
/** 通过率分母＝合法格数（不是矩阵总数 28）。 */
const LEGAL_CELLS = LEGAL_CELL_ORDER.length;
const cellKey = (r: { packId: string; intensity: number; players: number }) => `${r.packId}|${r.intensity}|${r.players}`;

function skippedIllegalCell(pack: PackSpec, intensity: number, players: number): CellResult {
  return {
    packId: pack.id, packName: pack.name, intensity, players,
    ok: false, skipped: true, reachedGame: false, viewOk: false, viewDetail: "",
    deckForPack: null, deckAiForPack: null, generationSource: null, currentPack: null, currentIntensity: null,
    currentMinPlayers: null, currentSource: null, elapsedMs: null,
    reason: `SKIPPED-ILLEGAL（人数低于玩法 minPlayers：${pack.id} minPlayers=${pack.minPlayers} > ${players}）`,
    screenshot: null, startedAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* 只读探针（绝不返回任何密钥内容）                                     */
/* ------------------------------------------------------------------ */

const PROBE = `(() => new Promise((resolve) => {
  const out = { url: location.href, stores: [], counts: {}, profiles: [], activeProviderId: null, cryptoKeyRows: 0, secretRows: 0 };
  const req = indexedDB.open("party-night-v1");
  req.onerror = () => resolve({ ...out, err: String(req.error) });
  req.onsuccess = () => {
    const db = req.result;
    const names = Array.from(db.objectStoreNames);
    out.stores = names;
    let pending = names.length;
    const done = () => { pending -= 1; if (pending === 0) { db.close(); resolve(out); } };
    if (!pending) { db.close(); resolve(out); return; }
    for (const n of names) {
      try {
        const all = db.transaction(n, "readonly").objectStore(n).getAll();
        all.onsuccess = () => {
          const rows = all.result || [];
          out.counts[n] = rows.length;
          if (n === "aiProviderProfiles") out.profiles = rows.map((r) => ({ id: r.id, provider: r.id, hasKey: !!r.hasKey, enabled: r.enabled, model: r.modelId || r.model }));
          // 只读 activeProviderId 一个字段（不碰 recentPlayers/lastSessionConfig 等无关数据）
          if (n === "preferences") { const main = rows.find((r) => r.id === "main") || rows[0]; out.activeProviderId = (main && main.activeProviderId) || null; }
          if (n === "aiCryptoKeys") out.cryptoKeyRows = rows.length;
          if (n === "aiSecrets") out.secretRows = rows.length;
          done();
        };
        all.onerror = () => done();
      } catch { done(); }
    }
  };
}))()`;

interface ProbeResult {
  url: string;
  stores: string[];
  counts: Record<string, number>;
  profiles: { id: string; provider: string; hasKey: boolean; enabled?: boolean; model?: string }[];
  /** preferences.main.activeProviderId（真机实际生效的通道，唯一可信来源）。 */
  activeProviderId: string | null;
  cryptoKeyRows: number;
  secretRows: number;
  err?: string;
}

/**
 * 通道显示口径：以 preferences.main.activeProviderId 为唯一可信来源，
 * 显示对应 profile 的 provider/model（如 `opencode-go / deepseek-v4.1-flash`）并附注 activeProviderId。
 * 旧的「hasKey && enabled ?? profiles[0]」选择逻辑已删——会话级 Key 不落库导致 hasKey 恒 false，
 * 会永远误落到 profiles[0]，让产物 provider 字段失真。
 */
function providerLabel(data: ProbeResult): string {
  const activeId = data.activeProviderId;
  const prof = activeId ? data.profiles.find((p) => p.id === activeId) : undefined;
  if (!prof) return `未知（activeProviderId=${activeId ?? "缺失"}，aiProviderProfiles 无对应项）`;
  return `\`${prof.provider}\` / model=\`${prof.model ?? "?"}\`（activeProviderId=${activeId}）`;
}

/* ------------------------------------------------------------------ */
/* 会话快照（只读 sessions store，不含任何密钥）                        */
/* ------------------------------------------------------------------ */

const DECK_PROBE = (sessionId: string, packId: string) => `(() => new Promise((resolve, reject) => {
  const req = indexedDB.open("party-night-v1");
  req.onerror = () => reject(req.error);
  req.onsuccess = () => {
    const db = req.result;
    const all = db.transaction("sessions", "readonly").objectStore("sessions").getAll();
    all.onsuccess = () => {
      const rows = all.result || [];
      db.close();
      const s = rows.find((r) => r.id === ${JSON.stringify(sessionId)});
      if (!s) { resolve({ found: false }); return; }
      const deck = s.deckSnapshot || [];
      const forPack = deck.filter((c) => c.packId === ${JSON.stringify(packId)});
      const cur = s.currentRound ? deck.find((c) => c.id === s.currentRound.cardId) : null;
      resolve({
        found: true,
        status: s.status,
        currentPackId: s.currentPackId,
        mode: s.config && s.config.mode,
        enabledPackIds: (s.config && s.config.enabledPackIds) || [],
        intensity: s.config && s.config.intensity,
        activePlayers: ((s.config && s.config.players) || []).filter((p) => p.active).length,
        deckTotal: deck.length,
        deckForPack: forPack.length,
        deckAiForPack: forPack.filter((c) => c.source === "ai").length,
        deckPackIds: Array.from(new Set(deck.map((c) => c.packId))),
        generationSource: s.generationSource ?? null,
        current: cur ? { packId: cur.packId, intensity: cur.intensity, minPlayers: cur.minPlayers, source: cur.source, contentLen: String(cur.content || "").length } : null,
      });
    };
    all.onerror = () => { db.close(); reject(all.error); };
  };
}))()`;

interface DeckState {
  found: boolean;
  status?: string;
  currentPackId?: string;
  mode?: string;
  enabledPackIds?: string[];
  intensity?: number;
  activePlayers?: number;
  deckTotal?: number;
  deckForPack?: number;
  deckAiForPack?: number;
  deckPackIds?: string[];
  /** 整局生成来源（Session 落库字段；Change B 补充）：只有 "ai" 算 AI PASS。 */
  generationSource?: string | null;
  current?: { packId: string; intensity: number; minPlayers: number; source: string; contentLen: number } | null;
}

/* ------------------------------------------------------------------ */
/* 工具                                                                */
/* ------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * APP 实际 origin：从 CDP 页面 location 运行时读取（自包含包 origin 不固定，不写死）。
 * 页面 URL 不可解析时返回 "unknown"，由调用方记录进 JSON/MD 供人工核对。
 */
function readAppOrigin(page: Page): string {
  try {
    const origin = new URL(page.url()).origin;
    return origin && origin !== "null" ? origin : "unknown";
  } catch {
    return "unknown";
  }
}

/** 把 APP 拉回前台（只对 11t / IN9LZTAYV4UGU4JF；不重启进程、不清数据）。 */
function bringAppToFront() {
  try {
    execFileSync("adb", ["-s", DEV.adbSerial, "shell", "input", "keyevent", "KEYCODE_WAKEUP"], { stdio: "ignore" });
    execFileSync("adb", ["-s", DEV.adbSerial, "shell", "monkey", "-p", "night.party.app", "-c", "android.intent.category.LAUNCHER", "1"], { stdio: "ignore" });
  } catch { /* 拉前台失败不致命，后面帧探针会给明确错误 */ }
}

/**
 * 耗尽对话框兜底（「可玩的题都出完了」）：deck=0 / 卡全部耗尽时主局只弹
 * 「结束本局」「洗牌再玩」两个 button，无任何回首页链接，gotoHome 会死在找不到 a[href="/"]。
 * 处理：点「结束本局」→ 等 /summary → 由调用方走既有 summary→首页路径；按钮点不到则报错。
 */
async function dismissExhaustedDialog(page: Page, log?: (m: string) => void): Promise<boolean> {
  const dialog = page.getByText("可玩的题都出完了").first();
  if (!(await dialog.isVisible().catch(() => false))) return false;
  const endBtn = page.getByRole("button", { name: "结束本局" });
  if (!(await endBtn.isVisible().catch(() => false))) {
    throw new Error("耗尽对话框（可玩的题都出完了）出现但找不到「结束本局」按钮");
  }
  await endBtn.click({ timeout: 15000 });
  await page.waitForURL(/\/summary/, { timeout: 25000 }).catch(() => undefined);
  log?.("耗尽对话框兜底：点「结束本局」→ /summary");
  return true;
}

/**
 * 客户端路由回首页（**绝不整页导航**）。
 *
 * 为什么不能用 page.goto：手机端 Key 是「仅本次会话」的内存态
 * （`lib/storage/ai-provider-repository.ts` 的模块级 `sessionSecrets` Map；该 WebView 无法安全持久化
 * CryptoKey，保存时走 persist 失败分支 → 不落 aiSecrets/aiCryptoKeys）。
 * 任何整页文档加载都会重建 JS 运行时、把这个 Map 清空 ⇒ 后续所有格子都会卡在
 * 「请先配置 AI 接口」恢复页。因此本 harness 全程只走 APP 自身的客户端路由
 * （底部 Tab / 页内 Link / 应用内收局），整页重载次数保持 0。
 */
async function gotoHome(page: Page, log?: (m: string) => void): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    if (new URL(page.url()).pathname === "/") {
      await page.locator(".home-primary").waitFor({ state: "visible", timeout: 25000 });
      return;
    }
    // 1) 底部 Tab「首页」（/setup、/boundaries、/packs、/settings/* 都在）
    const tab = page.locator('.bottom-tabs a[href="/"]');
    if (await tab.isVisible().catch(() => false)) { await tab.click({ timeout: 15000 }); continue; }
    // 2) 页内「返回首页」链接（/summary）
    const back = page.locator('a[href="/"]:visible');
    if (await back.count().catch(() => 0)) { await back.first().click({ timeout: 15000 }); continue; }
    // 2.5) 耗尽对话框（「可玩的题都出完了」，只有「结束本局」「洗牌再玩」）→「结束本局」→ /summary
    if (await dismissExhaustedDialog(page, log)) continue;
    // 3) /game → 应用内收局 → /summary
    const end = page.locator(".round-header__end");
    if (await end.isVisible().catch(() => false)) {
      await end.click({ timeout: 15000 });
      await page.getByRole("button", { name: "确认结束" }).click({ timeout: 15000 }).catch(() => undefined);
      await page.waitForURL(/\/summary/, { timeout: 25000 }).catch(() => undefined);
      log?.("回首页中转：/game → 收局 → /summary");
      continue;
    }
    // 4) /generating（恢复页）→ 本地题库 → /game → 再由第 3 步收局
    const localBtn = page.getByRole("button", { name: "使用本地题库开始" });
    if (await localBtn.isVisible().catch(() => false)) {
      await localBtn.click({ timeout: 40000 }).catch(() => undefined);
      await page.waitForURL(RE_GAME_SESSION, { timeout: 40000 }).catch(() => undefined);
      log?.("回首页中转：/generating → 本地题库 → /game");
      continue;
    }
    throw new Error(`无法在不整页重载的前提下回首页（当前 ${page.url()}）`);
  }
  throw new Error("回首页失败（已重试 6 次）");
}

/**
 * 整页重载哨兵：文档身份（performance.timeOrigin）一旦变化，说明 WebView 里那份
 * 会话级 Key 已随 JS 运行时一起消失，后续格子跑下去毫无意义 ⇒ 立刻停线报错。
 */
async function docEpoch(page: Page): Promise<number> {
  return (await page.evaluate("performance.timeOrigin")) as number;
}

/**
 * 就绪判据（读 UI，不读密钥内容）。
 * 会话级 Key 不落 IndexedDB，所以 `aiProviderProfiles.hasKey` 恒为 false——**不能用它当门槛**。
 * 危险区文案直接渲染 `aiProviderRepository.hasSecret(activeId)`：
 * 「清空后需重新填写密钥才能继续使用此接口。」⇒ true；「当前已无密钥。」⇒ false。
 */
async function keyReadyViaUI(page: Page): Promise<{ ready: boolean; detail: string }> {
  if (!new URL(page.url()).pathname.startsWith("/settings/ai")) {
    // 两级导航兜底（全程只点 UI，不 page.goto / 不刷新，保会话级 Key 与 docEpoch 纪律）：
    // 1) 直达：当前视图已有 /settings/ai 入口则直接点；
    // 真机 DOM 实测：Link 渲染出的 href 带尾斜杠（/settings/ai/），CSS 属性精确匹配
    // 必须同时兼容带/不带尾斜杠两种形态（exact 匹配不会误伤 /settings/ai/xxx 子路径）。
    const AI_ENTRY_SEL = 'a[href="/settings/ai/"]:visible, a[href="/settings/ai"]:visible';
    const direct = page.locator(AI_ENTRY_SEL).first();
    if (await direct.count().catch(() => 0)) {
      await direct.click({ timeout: 15000 }).catch(() => undefined);
    }
    // 2) 兜底：产品导航两级——首页只有设置 Tab（/settings），进入后再点 /settings/ai 入口；
    //    每步 waitFor 对应视图（pathname 变化 / .danger-zone），点击失败继续兜底不抛。
    if (!new URL(page.url()).pathname.startsWith("/settings/ai")) {
      const settingsTab = page.locator('a[href="/settings/"]:visible, a[href="/settings"]:visible').first();
      if (await settingsTab.count().catch(() => 0)) {
        await settingsTab.click({ timeout: 15000 }).catch(() => undefined);
        await page.waitForURL(/\/settings(\/|$)/, { timeout: 20000 }).catch(() => undefined);
      }
      const aiEntry = page.locator(AI_ENTRY_SEL).first();
      if (await aiEntry.count().catch(() => 0)) {
        await aiEntry.click({ timeout: 15000 }).catch(() => undefined);
      }
    }
    await page.locator(".danger-zone").waitFor({ state: "visible", timeout: 20000 }).catch(() => undefined);
  }
  if (!new URL(page.url()).pathname.startsWith("/settings/ai")) return { ready: false, detail: `未到达 /settings/ai（当前 ${page.url()}）` };
  const text = ((await page.locator(".danger-zone p").textContent().catch(() => "")) ?? "").trim();
  return { ready: text.includes("清空后需重新填写密钥"), detail: `danger-zone=「${text}」` };
}

/** 帧存活探针（抗后台节流）：6s 内必须来一帧，否则视为被压后台。 */
async function assertWebViewAlive(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: true }).catch(() => undefined);
  await session.send("Page.setWebLifecycleState", { state: "active" }).catch(() => undefined);
  await session.detach().catch(() => undefined);
  const framed = await Promise.race([
    page.evaluate("new Promise((resolve) => requestAnimationFrame(() => resolve(true)))") as Promise<boolean>,
    sleep(6000).then(() => false),
  ]);
  if (!framed) throw new Error("WebView 6s 内未出帧（APP 可能被压后台）");
}

/* ------------------------------------------------------------------ */
/* 走局：清理残留 → 组局 → 生成 → 出卡                                 */
/* ------------------------------------------------------------------ */

/** 首页若残留未完成局（active/generating），走应用内流程收掉，保证下一次是干净新组局。 */
async function clearLeftover(page: Page, log: (m: string) => void): Promise<void> {
  for (let guard = 0; guard < 4; guard += 1) {
    await gotoHome(page, log);
    if (!(await page.locator(".resume-session").isVisible().catch(() => false))) return;
    log("清理残留未完成局");
    await page.locator(".resume-session a").click();
    await page.waitForURL(RE_ANY_SESSION, { timeout: 25000 });
    if (RE_GENERATING_SESSION.test(page.url())) {
      await page.getByRole("button", { name: "使用本地题库开始" }).click({ timeout: 40000 });
      await page.waitForURL(RE_GAME_SESSION, { timeout: 40000 });
    }
    await endSession(page, log);
  }
  throw new Error("残留未完成局清理失败（已重试 4 次）");
}

/** 应用内正常收局：顶栏「结束」→「确认结束」→ 总结页；无顶栏（空题库页）则走「查看总结」。 */
async function endSession(page: Page, log: (m: string) => void): Promise<void> {
  if (RE_GAME_SESSION.test(page.url())) {
    // 耗尽对话框可能先于收局撞上（deck=0 时主局只弹「结束本局/洗牌再玩」，顶栏收局不可点）：
    // 先兜底点「结束本局」→ /summary，再走常规回首页。
    if (await dismissExhaustedDialog(page, log)) {
      await gotoHome(page, log);
      return;
    }
    const headerEnd = page.locator(".round-header__end");
    if (await headerEnd.isVisible().catch(() => false)) {
      await headerEnd.click({ timeout: 15000 });
      await page.getByRole("button", { name: "确认结束" }).click({ timeout: 15000 });
      await page.waitForURL(/\/summary/, { timeout: 25000 }).catch(() => undefined);
      log("已收局（顶栏结束）");
    } else {
      const summaryBtn = page.getByRole("button", { name: "查看总结" });
      if (await summaryBtn.isVisible().catch(() => false)) {
        await summaryBtn.click({ timeout: 15000 });
        await page.waitForURL(/\/summary/, { timeout: 25000 }).catch(() => undefined);
        log("已收局（空题库页 → 查看总结）");
      } else {
        log("收局降级：交给 gotoHome 兜底（非 game/summary 视图）");
      }
    }
  }
  await gotoHome(page, log);
}

/** 断言当前玩法视图「有卡可玩」。 */
async function assertPlayableView(page: Page, pack: PackSpec, players: number): Promise<{ ok: boolean; detail: string }> {
  if (await page.locator(".empty-deck").isVisible().catch(() => false)) {
    return { ok: false, detail: "空题库页（该玩法当前无可玩卡）" };
  }
  const nonEmpty = async (loc: string, label: string, max = VIEW_TIMEOUT_MS) => {
    const el = page.locator(loc).first();
    await el.waitFor({ state: "visible", timeout: max });
    const text = ((await el.textContent()) ?? "").trim();
    return text.length ? { ok: true, detail: `${label} ${text.length} 字` } : { ok: false, detail: `${label}为空` };
  };
  switch (pack.view) {
    case "card":
      return nonEmpty(".game-card h1", "题面");
    case "binary":
      return nonEmpty(".would-you-rather__option--a", "二选一 A 选项");
    case "pointing":
      return nonEmpty(".pointing-game h1", "指人指令");
    case "compatibility":
      return nonEmpty(".compatibility-game h1", "默契题面");
    case "spin": {
      await page.locator(".spin-bottle").waitFor({ state: "visible", timeout: VIEW_TIMEOUT_MS });
      const seats = await page.locator(".spin-bottle__seat").count();
      const enabled = await page.getByRole("button", { name: "开始旋转" }).isEnabled().catch(() => false);
      return seats >= players && enabled
        ? { ok: true, detail: `座位 ${seats} 个 · 可旋转` }
        : { ok: false, detail: `座位 ${seats}/${players} · 可旋转=${enabled}` };
    }
  }
}

interface CellResult {
  packId: string;
  packName: string;
  intensity: number;
  players: number;
  ok: boolean;
  /** SKIPPED-ILLEGAL 标记：人数低于玩法 minPlayers 的非法格（不计 PASS/FAIL、不进分母）。 */
  skipped: boolean;
  reachedGame: boolean;
  viewOk: boolean;
  viewDetail: string;
  deckForPack: number | null;
  deckAiForPack: number | null;
  /** 整局生成来源（读 Session 落库字段；Change B 补充）：只有 "ai" 算 AI PASS。 */
  generationSource: string | null;
  currentPack: string | null;
  currentIntensity: number | null;
  currentMinPlayers: number | null;
  currentSource: string | null;
  elapsedMs: number | null;
  reason: string | null;
  screenshot: string | null;
  startedAt: string;
}

async function runCell(page: Page, pack: PackSpec, intensity: number, players: number, log: (m: string) => void): Promise<CellResult> {
  const startedAt = new Date().toISOString();
  const shotName = `${pack.id}__i${intensity}__p${players}.png`;
  const shotPath = join(OUT_DIR, shotName);
  const result: CellResult = {
    packId: pack.id, packName: pack.name, intensity, players,
    ok: false, skipped: false, reachedGame: false, viewOk: false, viewDetail: "",
    deckForPack: null, deckAiForPack: null, generationSource: null, currentPack: null, currentIntensity: null,
    currentMinPlayers: null, currentSource: null, elapsedMs: null, reason: null, screenshot: null, startedAt,
  };

  await clearLeftover(page, log);
  await assertWebViewAlive(page);

  // 1) 首页玩法卡 → /setup?pack=<id>（mode=single）
  await page.locator(".mode-grid a", { hasText: pack.name }).first().click();
  await page.waitForURL(new RegExp(`/setup\\/?\\?pack=${pack.id}`), { timeout: 25000 });

  // 2) setup 会异步套用「上次设置」，等它落地再改，避免被回写覆盖
  await page.locator(".stepper").waitFor({ state: "visible", timeout: 20000 });
  await page.locator(".quick-start-banner").waitFor({ state: "visible", timeout: 4000 }).catch(() => undefined);
  await sleep(800);

  // 3) 人数
  for (let i = 0; i < 16; i += 1) {
    const count = Number(((await page.locator(".stepper strong").innerText()) ?? "").replace(/\D/g, ""));
    if (count === players) {
      await sleep(300);
      if (Number(((await page.locator(".stepper strong").innerText()) ?? "").replace(/\D/g, "")) === players) break;
      continue;
    }
    await page.getByRole("button", { name: count > players ? "减少玩家" : "增加玩家" }).click();
    await sleep(120);
  }

  // 4) 强度
  const slider = page.getByLabel("游戏强度");
  await slider.fill(String(intensity));
  if ((await slider.inputValue()) !== String(intensity)) throw new Error(`强度未设为 ${intensity}`);

  // 5) 雷区 → 生成
  await page.getByRole("button", { name: /下一步：雷区设置/ }).click();
  await page.waitForURL(/\/boundaries/, { timeout: 25000 });
  const genBtn = page.getByRole("button", { name: /下一步：生成游戏/ });
  await genBtn.waitFor({ state: "visible", timeout: 20000 });
  for (let i = 0; i < 40 && (await genBtn.isDisabled().catch(() => true)); i += 1) await sleep(200);

  const t0 = Date.now();
  await genBtn.click();
  await page.waitForURL(RE_GENERATING_SESSION, { timeout: 30000 });

  // 6) 等 AI 出卡（或落到 recovery）
  let outcome: "game" | "error" | "timeout" = "timeout";
  const deadline = Date.now() + GEN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (RE_GAME_SESSION.test(page.url())) { outcome = "game"; break; }
    if (await page.locator(".generation-recovery").isVisible().catch(() => false)) { outcome = "error"; break; }
    await sleep(400);
  }

  if (outcome === "error") {
    const head = ((await page.locator(".generation-recovery h1").textContent().catch(() => "")) ?? "").trim();
    const body = ((await page.locator(".generation-recovery p").textContent().catch(() => "")) ?? "").trim();
    result.reason = `AI 生成失败：${head || "未知"}${body ? ` / ${body}` : ""}`;
    await page.screenshot({ path: shotPath, timeout: 40000 }).catch(() => undefined);
    result.screenshot = shotPath;
    await endSession(page, log);
    return result;
  }
  if (outcome === "timeout") {
    result.reason = `生成页 ${GEN_TIMEOUT_MS / 1000}s 内既未出卡也未报错`;
    await page.screenshot({ path: shotPath, timeout: 40000 }).catch(() => undefined);
    result.screenshot = shotPath;
    await endSession(page, log);
    return result;
  }

  result.reachedGame = true;
  const sessionId = new URL(page.url()).searchParams.get("session") ?? "";

  // 7) 断言有卡可玩
  let view = { ok: false, detail: "未断言" };
  try {
    view = await assertPlayableView(page, pack, players);
  } catch (error) {
    view = { ok: false, detail: `视图未出现：${(error as Error).message.split("\n")[0]}` };
  }
  result.viewOk = view.ok;
  result.viewDetail = view.detail;
  result.elapsedMs = Date.now() - t0;

  // 8) 落库快照（卡数 / 是否串包 / 当前卡强度）
  try {
    const state = (await page.evaluate(DECK_PROBE(sessionId, pack.id) as unknown as string)) as DeckState;
    if (state.found) {
      result.deckForPack = state.deckForPack ?? null;
      result.deckAiForPack = state.deckAiForPack ?? null;
      result.generationSource = state.generationSource ?? null;
      result.currentPack = state.current?.packId ?? null;
      result.currentIntensity = state.current?.intensity ?? null;
      result.currentMinPlayers = state.current?.minPlayers ?? null;
      result.currentSource = state.current?.source ?? null;
    }
  } catch { /* 快照读不到不影响主判定 */ }

  // 9) 截图 1 张
  await page.screenshot({ path: shotPath, timeout: 40000 });
  result.screenshot = shotPath;

  // 10) 判定（AI PASS 必须同时满足：视图可玩 + 该玩法有卡 + 生成来源字段为 "ai"）
  const packMismatch = Boolean(result.currentPack && result.currentPack !== pack.id);
  const noCard = pack.view !== "spin" && result.deckForPack !== null && result.deckForPack === 0;
  if (packMismatch) {
    result.reason = `串包：请求 ${pack.id}，主局当前卡属于 ${result.currentPack}`;
  } else if (noCard) {
    result.reason = `零可玩卡（deck 中 ${pack.id} 卡数 = 0）`;
  } else if (!isAiGenerationSource(result.generationSource)) {
    result.reason = `非 AI 生成来源：generationSource=${result.generationSource ?? "缺失"}（静默回退本地题库不算 AI PASS）`;
  } else if (!view.ok) {
    result.reason = `断言失败：${view.detail}`;
  } else {
    result.ok = true;
  }

  // 11) 退出
  await endSession(page, log);
  return result;
}

/* ------------------------------------------------------------------ */
/* 入口                                                                */
/* ------------------------------------------------------------------ */

async function connect(): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.connectOverCDP(DEV.endpoint, { timeout: 20000 });
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0];
  page.setDefaultTimeout(25000);
  return { browser, page };
}

async function probe(): Promise<void> {
  bringAppToFront();
  const { browser, page } = await connect();
  try {
    console.log(`页面: ${page.url()}`);
    console.log(`APP_ORIGIN=${readAppOrigin(page)}`);
    const data = (await page.evaluate(PROBE as unknown as string)) as ProbeResult;
    console.log(JSON.stringify({
      url: data.url,
      stores: data.stores,
      counts: data.counts,
      profiles: data.profiles,
      activeProviderId: data.activeProviderId,
      cryptoKeyRows: data.cryptoKeyRows,
      secretRows: data.secretRows,
    }, null, 2));
    console.log(`\nPROVIDER=${providerLabel(data)}`);
    const keyHint = data.secretRows > 0 && data.cryptoKeyRows > 0;
    console.log(`\nKEY_READY_HINT=${keyHint}（落库 secret 行口径，最终以 run 的 UI hasSecret 与真实生成为准；cryptoKeyRows=${data.cryptoKeyRows}, secretRows=${data.secretRows}）`);
    const key = await keyReadyViaUI(page);
    console.log(`KEY_READY(UI hasSecret)=${key.ready} ${key.detail}`);
  } finally {
    await browser.close();
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/**
 * 分片累加：单次前台执行有 10 分钟上限，而 28 格真机走局约需半小时，
 * 所以按玩法分片多次执行；每次都把历史格子读回来合并，产出唯一一份完整明细。
 */
function readPriorResults(): CellResult[] {
  try {
    if (!existsSync(JSON_FILE)) return [];
    const parsed = JSON.parse(readFileSync(JSON_FILE, "utf8")) as { results?: CellResult[] };
    return Array.isArray(parsed.results) ? parsed.results : [];
  } catch { return []; }
}

function readPriorRunStartedAt(): string | undefined {
  try {
    if (!existsSync(JSON_FILE)) return undefined;
    const parsed = JSON.parse(readFileSync(JSON_FILE, "utf8")) as { runStartedAt?: string };
    return parsed.runStartedAt;
  } catch { return undefined; }
}

function mergeResults(fresh: CellResult[]): CellResult[] {
  const map = new Map<string, CellResult>();
  for (const r of [...readPriorResults(), ...fresh]) map.set(cellKey(r), r);
  return PACKS.flatMap((pack) => INTENSITIES.flatMap((intensity) => PLAYER_COUNTS.flatMap((players) => {
    // 以当前玩法契约为准：历史 PASS/FAIL 和本次结果均不能覆盖非法格。
    if (!isLegalCell(pack, players)) return [skippedIllegalCell(pack, intensity, players)];
    const r = map.get(`${pack.id}|${intensity}|${players}`);
    return r ? [r] : [];
  })));
}

function buildMarkdown(results: CellResult[], startedAtIso: string, provider: string, appOrigin: string): string {
  const pass = results.filter((r) => r.ok).length;
  const skipped = results.filter((r) => r.skipped);
  const fails = results.filter((r) => !r.ok && !r.skipped);
  const lat = results.filter((r) => !r.skipped).map((r) => r.elapsedMs).filter((v): v is number => typeof v === "number");
  // 覆盖/分母口径＝合法格数（AI-MATRIX-PLAN §1：players < pack.minPlayers 的格不生成），
  // SKIPPED-ILLEGAL 格不算 PASS 不算 FAIL，不进分母。
  const covered = results.filter((r) => !r.skipped).length;
  const rate = ((pass / LEGAL_CELLS) * 100).toFixed(1);
  const lines: string[] = [];

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`## 真机复跑 · ${startedAtIso.slice(0, 10)}（11T Pro+ / 11t）`);
  lines.push("");
  lines.push(`- 设备：${DEV.label} · adb \`${DEV.serial}\` · 机型 ${DEV.model}`);
  lines.push(`- 通道：WebView CDP（Playwright \`connectOverCDP\` tcp:${new URL(DEV.endpoint).port}）→ APP origin \`${appOrigin}\`（运行时记录，自包含包 WebView 本地 origin）`);
  lines.push(`- 链路口径：自包含 APK（NEXT_PUBLIC_SELF_CONTAINED=1）→ direct/native transport（CapacitorHttp → Provider \`chat/completions\`）；Mac :3000 不作为真机业务依赖（自包含包无 /api 代理，生成走前端直连；:3000 仅 Mac 侧矩阵 harness 使用）`);
  lines.push(`- 证据格：自包含包 + 实际 origin + generationSource=ai（见明细行/截图）`);
  lines.push(`- Provider：${provider}`);
  lines.push("- 鉴权：**手机 APP 内已配置的真实 API Key**（harness 全程不读、不打印、不落盘密钥）");
  lines.push(`- 矩阵：7 玩法 × 强度 {2,5} × 人数 {2,4} = ${TOTAL_CELLS} 组，其中合法 ${LEGAL_CELLS} 组（players < pack.minPlayers 的格不生成，AI-MATRIX-PLAN §1 同口径）；每个合法格截图 1 张；相邻调用间隔 ≥ ${MIN_CALL_GAP_MS / 1000}s`);
  lines.push("- 每组流程：首页玩法卡 → 组局(人数/强度) → 雷区 → 生成游戏(AI) → 等出卡 → 断言可玩 → 截图 → 应用内收局");
  lines.push("- 判定：视图可玩 且 该玩法有卡 且 Session `generationSource === \"ai\"`（只有 `ai` 算 AI PASS；静默回退本地题库不算）");
  lines.push(`- 整页重载：**0 次**（会话级内存 Key 不能承受任何文档级导航；harness 只走 APP 客户端路由）`);
  lines.push("");
  lines.push(`### 通过率：${pass}/${LEGAL_CELLS} = **${rate}%**（分母＝合法格数，AI-MATRIX-PLAN §1 同口径）${covered < LEGAL_CELLS ? `（当前仅覆盖 ${covered}/${LEGAL_CELLS} 合法格）` : ""}${skipped.length ? `；SKIPPED-ILLEGAL ${skipped.length} 格（不计入 PASS/FAIL 与分母）` : ""}`);
  lines.push("");
  if (lat.length) {
    lines.push(`- 出卡耗时（点「生成游戏」→ 视图可见）：最小 ${Math.min(...lat)}ms / 中位 ${median(lat)}ms / 平均 ${Math.round(lat.reduce((a, b) => a + b, 0) / lat.length)}ms / 最大 ${Math.max(...lat)}ms`);
  }
  lines.push("");
  lines.push("### 组合明细");
  lines.push("");
  lines.push("| 玩法 | 强度 | 人数 | 结果 | 卡数(该玩法/其中AI) | 来源 | 当前卡玩法 | 卡片强度 | 耗时(ms) | 失败原因 | 截图 |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    const cardCell = r.packId === "spin-bottle" ? "—（纯本地玩法，无题卡）" : `${r.deckForPack ?? "?"} / ${r.deckAiForPack ?? "?"}`;
    lines.push(
      `| ${r.packName} \`${r.packId}\` | ${r.intensity} | ${r.players} 人 | ${r.skipped ? "⏭ SKIPPED-ILLEGAL" : r.ok ? "✅ 通过" : "❌ 失败"} | ${cardCell} | ${r.generationSource ?? "缺失"} | ${r.currentPack ?? "—"} | ${r.currentIntensity ?? "—"} | ${r.elapsedMs ?? "—"} | ${r.reason ?? ""} | ${!r.skipped && r.screenshot ? r.screenshot.split("/").pop() : "—"} |`,
    );
  }
  lines.push("");
  lines.push("### 失败清单");
  lines.push("");
  if (!fails.length) {
    lines.push("（无失败组）");
  } else {
    lines.push("| # | 玩法 | 强度 | 人数 | 失败原因 |");
    lines.push("|---|---|---|---|---|");
    fails.forEach((r, i) => lines.push(`| ${i + 1} | ${r.packName} \`${r.packId}\` | ${r.intensity} | ${r.players} 人 | ${r.reason} |`));
  }
  lines.push("");
  lines.push(`### 截图目录`);
  lines.push("");
  lines.push("`test-results/phone/ai-matrix/`（每个合法格 1 张，文件名 `<packId>__i<强度>__p<人数>.png`）");
  lines.push("注：`pointing-game__i2__p2.png` 是首轮按旧口径执行该非法格留下的截图，保留为历史证据，不计入本次矩阵截图。");
  lines.push("");
  return lines.join("\n");
}

async function run(filter?: { pack?: string; intensity?: number; players?: number }): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  bringAppToFront();
  const { browser, page } = await connect();
  const results: CellResult[] = [];
  let provider = "未知（见探针）";
  const appOrigin = readAppOrigin(page);
  try {
    console.log(`页面: ${page.url()}`);
    console.log(`APP_ORIGIN=${appOrigin}（运行时记录，写入 JSON/MD 头部）`);
    const data = (await page.evaluate(PROBE as unknown as string)) as ProbeResult;
    provider = providerLabel(data);
    console.log(`Provider=${provider}`);
    console.log(`IndexedDB profiles=${data.profiles.map((p) => `${p.id}(hasKey=${p.hasKey})`).join(",")}（会话级 Key 不落库，hasKey=false 属预期；通道以 activeProviderId 为准）`);
    // 顺序关键：先清残留（clearLeftover 以 gotoHome 开头，能从任意页——包括停在局内
    // /game/?session=… 的游戏页——客户端路由回首页）。APP 停在局内时游戏页无四 Tab、
    // 无 /settings/ai 入口，若先跑 keyReadyViaUI 会报「未到达 /settings/ai」停线。
    // clearLeftover 失败必须显式抛出（外层 finally 收尾后停线），不许静默继续跑格。
    await clearLeftover(page, (m) => console.log(`    · ${m}`));
    console.log("残留清理完成（已回首页）");
    const key = await keyReadyViaUI(page);
    console.log(`KEY_READY(UI hasSecret)=${key.ready} ${key.detail}`);
    if (!key.ready) throw new Error(`手机端会话级 AI Key 不可用（${key.detail}）→ 停线，不伪造结果`);
    await gotoHome(page, (m) => console.log(`    · ${m}`)); // keyReadyViaUI 结束时停在 /settings/ai，底部 Tab 可见，点回首页
    const epoch0 = await docEpoch(page);
    console.log(`文档身份 docEpoch=${epoch0}（全程不得变化＝不得发生整页重载）`);

    const cells = PACKS.flatMap((pack) => INTENSITIES.flatMap((intensity) => PLAYER_COUNTS.map((players) => ({ pack, intensity, players }))))
      .filter((c) => (!filter?.pack || c.pack.id === filter.pack)
        && (filter?.intensity === undefined || c.intensity === filter.intensity)
        && (filter?.players === undefined || c.players === filter.players));

    console.log(`\n=== 11T Pro+ AI 全矩阵：${cells.length} 组 ===`);
    let lastGenAt = 0;
    let aborted: string | null = null;
    for (let i = 0; i < cells.length; i += 1) {
      const { pack, intensity, players } = cells[i]!;
      const tag = `[${i + 1}/${cells.length}] ${pack.name}(${pack.id}) · 强度${intensity} · ${players}人`;
      // 合法性格过滤（AI-MATRIX-PLAN §1）：人数低于玩法 minPlayers 的格不生成，记 SKIPPED-ILLEGAL。
      if (!isLegalCell(pack, players)) {
        const skipped = skippedIllegalCell(pack, intensity, players);
        console.log(`\n--- ${tag} ---`);
        console.log(`    ⇒ SKIP ${skipped.reason}`);
        results.push(skipped);
        continue;
      }
      const gap = Date.now() - lastGenAt;
      if (lastGenAt && gap < MIN_CALL_GAP_MS) await sleep(MIN_CALL_GAP_MS - gap);
      const epochNow = await docEpoch(page);
      if (epochNow !== epoch0) { aborted = `检测到整页重载（docEpoch ${epoch0} → ${epochNow}）＝会话级 Key 已随 JS 运行时清空`; break; }
      console.log(`\n--- ${tag} ---`);
      let r: CellResult;
      try {
        lastGenAt = Date.now();
        r = await runCell(page, pack, intensity, players, (m) => console.log(`    · ${m}`));
      } catch (error) {
        r = {
          packId: pack.id, packName: pack.name, intensity, players,
          ok: false, skipped: false, reachedGame: false, viewOk: false, viewDetail: "",
          deckForPack: null, deckAiForPack: null, generationSource: null, currentPack: null, currentIntensity: null,
          currentMinPlayers: null, currentSource: null, elapsedMs: null,
          reason: `harness 异常：${(error as Error).message.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 3).join(" ｜ ")}`, screenshot: null, startedAt: new Date().toISOString(),
        };
        // 尽力恢复现场，避免一格异常拖垮后续
        try { await clearLeftover(page, () => undefined); } catch { /* 下一格会再试 */ }
      }
      results.push(r);
      console.log(`    ⇒ ${r.ok ? "PASS" : "FAIL"} ${r.reason ?? r.viewDetail}${r.elapsedMs ? ` (${r.elapsedMs}ms)` : ""}`);
    }
    if (aborted) {
      console.log(`\n!!! 已中止：${aborted}`);
      for (let j = results.length; j < cells.length; j += 1) {
        const { pack, intensity, players } = cells[j]!;
        if (!isLegalCell(pack, players)) {
          results.push(skippedIllegalCell(pack, intensity, players));
          continue;
        }
        results.push({
          packId: pack.id, packName: pack.name, intensity, players,
          ok: false, skipped: false, reachedGame: false, viewOk: false, viewDetail: "",
          deckForPack: null, deckAiForPack: null, generationSource: null, currentPack: null, currentIntensity: null,
          currentMinPlayers: null, currentSource: null, elapsedMs: null,
          reason: `未执行（${aborted}）`, screenshot: null, startedAt: new Date().toISOString(),
        });
      }
    }
  } finally {
    await browser.close().catch(() => undefined);
  }

  const runStartedAt = readPriorRunStartedAt() ?? new Date().toISOString();
  const merged = mergeResults(results);
  const pass = merged.filter((r) => r.ok).length;
  const skippedCount = merged.filter((r) => r.skipped).length;
  const freshSkippedCount = results.filter((r) => r.skipped).length;
  // 通过率分母＝合法格数 LEGAL_CELLS（AI-MATRIX-PLAN §1 同口径：players < pack.minPlayers 的格不生成，
  // SKIPPED-ILLEGAL 格不算 PASS 不算 FAIL、不进分母）。
  const rate = ((pass / LEGAL_CELLS) * 100).toFixed(1);
  console.log(`\n================ 汇总（累计） ================`);
  console.log(`本次 ${results.length} 格（SKIPPED-ILLEGAL ${freshSkippedCount}）；累计 ${merged.length}/${TOTAL_CELLS} 格（合法 ${LEGAL_CELLS}，SKIPPED-ILLEGAL ${skippedCount}）`);
  console.log(`通过 ${pass}/${LEGAL_CELLS} = ${rate}%（分母＝合法格数，AI-MATRIX-PLAN §1 同口径）`);
  merged.filter((r) => r.skipped).forEach((r) => console.log(`  ⏭ ${r.packId} i${r.intensity} p${r.players}: ${r.reason}`));
  merged.filter((r) => !r.ok && !r.skipped).forEach((r) => console.log(`  ✗ ${r.packId} i${r.intensity} p${r.players}: ${r.reason}`));
  console.log(`截图目录：${OUT_DIR}`);
  writeFileSync(JSON_FILE, JSON.stringify({ runStartedAt, updatedAt: new Date().toISOString(), provider, device: DEV, origin: appOrigin, totalCells: TOTAL_CELLS, legalCells: LEGAL_CELLS, skippedIllegal: skippedCount, results: merged }, null, 2), "utf8");

  const md = buildMarkdown(merged, runStartedAt, provider, appOrigin);
  writeFileSync(MD_FILE, `# AI-MATRIX-PHONE｜真机（11T Pro+）AI 组局全矩阵实测\n${md}`, "utf8");
  console.log(`结果写入：${MD_FILE}`);
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "probe";
  if (mode === "probe") return probe();
  const filter = {
    pack: process.argv[3],
    intensity: process.argv[4] ? Number(process.argv[4]) : undefined,
    players: process.argv[5] ? Number(process.argv[5]) : undefined,
  };
  return run(filter);
}

void main();
