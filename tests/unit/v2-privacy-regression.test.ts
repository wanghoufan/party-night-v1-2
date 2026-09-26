import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/generate-session/route";
import { generateDeckDirect } from "@/lib/ai/direct-provider";
import { requestGeneratedDeck } from "@/lib/ai/generate-deck";
import type { AIProviderProfile } from "@/lib/ai/provider";
import { callProvider } from "@/lib/ai/upstream";
import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { GameSession } from "@/lib/domain/schemas";
import { relationshipOf, withV2State } from "@/lib/engine/v2-deal";
import {
  beginMutualCheckRun,
  finalizeMutualCheckRun,
  mutualCheckFinalEvents,
  submitMutualChoice,
} from "@/lib/v2-relationship/v2-mutual-check";
import { reduceV2SessionEvents, createV2SessionState } from "@/lib/v2-relationship/v2-session";
import { createInitialRelationshipState, type SessionParticipant } from "@/lib/v2-relationship/v2-state";

/**
 * R-CB10 / DoD #13-#14｜V2 隐私回归（运行时断言，落在真实组装·序列化边界上）。
 *
 * 捕获边界（都是真实函数，网络层被 mock，不发任何真请求）：
 * 1. App → `/api/generate-session` 的**实际 HTTP body**（`requestGeneratedDeck` + 捕获 fetch）；
 * 2. 服务端 → Provider 的**实际 payload 与 prompt**（捕获 `callProvider` 第 3 参 `messages`）；
 * 3. 自包含直连（WebView 无 /api）的**实际 wire body**（捕获 `generateDeckDirect` 发出的 fetch body）；
 * 4. 日志（`console.error` 实捕）与外发序列化（真实 Session / 真实 final 事件）。
 *
 * 姓名口径（重要，见回执偏差说明）：
 * - 应用域模型里**没有**「真实姓名」字段，只有 Host 输入的昵称 `Player.displayName`；昵称进入
 *   AI prompt 是 V1.0 起冻结的既有契约（`tests/fixtures/ai-prompt-v1.0.json` 逐字回归），
 *   B3 不改产品内容语义。因此这里把「玩家真实姓名」钉成一条**真断言**：
 *   给当局参与者投影注入 `realName`（本局身份真值），断言它**任何一条外发路径都不出现**，
 *   从而证明「Session 参与者投影（含姓名）不进 AI / 日志 / 外发序列化」。
 * - 断言不是自证循环：先用反向对照证明 fixture 真的带着这些敏感值（`JSON.stringify(session)` 命中），
 *   再看同样的 session 组装出来的请求体是否命中。
 */

const REAL_NAMES = ["欧阳长风", "司马雪莉", "上官若男", "诸葛明轩"];
const NICKNAMES = ["嘉宾一", "嘉宾二", "嘉宾三", "嘉宾四"];
const GENDERS = ["male", "female", "female", "female"] as const; // 1男3女（Single-Anchor 桌）

/** 外发路径一律不得出现的敏感词：性别枚举 / 字段名 / anchor / 性别数量结构 / 参与者投影 / 真实姓名 / pairKey。 */
const FORBIDDEN = /(pairGender|realName|singleAnchor|anchor|male|female|男|女|欧阳长风|司马雪莉|上官若男|诸葛明轩|p1::p2|playerCoverage|lastTargetedPairKey|participants|playerId|mutual-pick|maskRevealed)/i;

const providerProfile: AIProviderProfile = {
  id: "privacy-provider",
  type: "deepseek-official",
  name: "隐私回归通道",
  baseUrl: "https://api.deepseek.com",
  modelId: "deepseek-chat",
  protocol: "openai-chat-completions",
  isDefault: true,
  experimental: false,
  autoFallback: false,
  enabled: true,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/** 真实当局 Session：参与者投影带 pairGender + realName；关系态带 Coverage / MATCH / anchor 曝光。 */
function privacySession(): GameSession {
  const players = NICKNAMES.map((displayName, index) => ({
    id: `p${index + 1}`,
    displayName,
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastUsedAt: "2026-01-01T00:00:00.000Z",
  }));
  const participants = players.map((player, index) => ({
    playerId: player.id,
    active: true,
    pairGender: GENDERS[index],
    // 本局身份真值（域模型里不存在该字段；此处刻意注入以证明它不会被任何外发路径带走）
    realName: REAL_NAMES[index],
  }));
  return {
    schemaVersion: 2,
    id: "s-privacy",
    status: "active",
    mode: "single",
    config: {
      players,
      relationship: "friends",
      vibes: ["funny"],
      intensity: 3,
      boundaries: { ...DEFAULT_BOUNDARIES, customText: "" },
      enabledPackIds: ["truth-dare"],
      mode: "single",
    },
    deckSnapshot: [],
    usedCardIds: [],
    rounds: [],
    currentPackId: "truth-dare",
    currentSegmentId: "seg-privacy",
    currentPackState: {},
    recentRejectedFingerprints: [],
    // 当局参与者投影（含性别与真名）：只允许留在本地 Relationship Engine
    participants,
    relationshipState: {
      ...createInitialRelationshipState(),
      relationshipEffectiveCardCount: 9,
      playerCoverage: { p1: { offeredTargeted: 2, completedTargeted: 1, consecutiveTargetedSkips: 1, lowParticipation: true } },
      matches: { "p1::p2": { pairKey: "p1::p2", matchedAt: "2026-01-01T00:00:00.000Z", playerIds: ["p1", "p2"] } },
      cooldowns: { "p3::p4": 2 },
    },
    v2Orchestration: {
      softDedupWindow: 5,
      awaitingHostDecision: false,
      lastExhaustionLevel: "BUCKET_OK",
      finished: false,
      hostDecisions: {},
      lastTargetedPairKey: "p1::p2",
    },
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as unknown as GameSession;
}

/** 一张通过 schema 与安全过滤的本地卡（只为让真实调用链跑到底，不参与隐私断言）。 */
const card = (id: string) => ({
  id, packId: "truth-dare", type: "truth", content: `安全题目${id}`, instruction: "如实回答",
  intensity: 1, tags: [], boundaryTags: [], minPlayers: 2, participantMode: "single", source: "ai",
});
const cardBatch = (prefix: string) => Array.from({ length: 10 }, (_, index) => card(`${prefix}-${index + 1}`));

/* ------------------------------------------------------------------ */
/* 1. App → /api 的实际 HTTP body + 服务端 → Provider 的实际 payload/prompt  */
/* ------------------------------------------------------------------ */

vi.mock("@/lib/ai/upstream", () => ({
  callProvider: vi.fn(),
  extractMessageContent: (body: unknown) => body as string,
}));
const callProviderMock = vi.mocked(callProvider);

const apiResponse = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload }) as unknown as Response;

beforeEach(() => {
  callProviderMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("R-CB10｜AI 请求 payload / prompt 不含性别·anchor·参与者投影", () => {
  it("反向对照：fixture 真的带着 pairGender / anchor / 真名（证明断言不是空跑）", () => {
    const serialized = JSON.stringify(privacySession());
    expect(serialized).toContain("pairGender");
    expect(serialized).toContain('"male"');
    expect(serialized).toContain("lastTargetedPairKey");
    for (const name of REAL_NAMES) expect(serialized).toContain(name);
  });

  it("App → /api/generate-session 的实际 HTTP body 不含性别 / anchor / 参与者投影 / 真名", async () => {
    const session = privacySession();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(apiResponse({ cards: cardBatch("api"), meta: { generatedCount: 10, provider: "p" }, generationSource: "ai" }));

    await requestGeneratedDeck({
      profile: providerProfile,
      apiKey: "test-key",
      sessionConfig: session.config,
      sessionId: session.id,
      targetCardCount: 10,
    });

    const body = fetchSpy.mock.calls[0]![1]!.body as string;
    expect(body).toContain("truth-dare"); // 证明我们抓到的确实是这次请求体
    expect(body).not.toMatch(FORBIDDEN);
  });

  it("服务端 → Provider 的实际 payload / prompt 不含性别 / anchor / 参与者投影 / 真名（含伪造额外字段也一样）", async () => {
    const session = privacySession();
    callProviderMock.mockResolvedValue({
      status: 200,
      body: JSON.stringify({ cards: cardBatch("srv"), meta: { generatedCount: 10, provider: "p" } }),
    });

    const response = await POST(new Request("http://localhost/api/generate-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-key" },
      // 故意把整局 Session（含 participants/relationshipState）也塞进请求体：边界必须自己剥掉
      body: JSON.stringify({ profile: providerProfile, sessionConfig: session.config, session: session, targetCardCount: 10, sessionId: session.id }),
    }));
    expect(response.status).toBe(200);

    const payload = callProviderMock.mock.calls[0]![2] as { messages: { role: string; content: string }[] };
    const sent = JSON.stringify(payload);
    const prompt = payload.messages[1]!.content;
    expect(prompt).toContain("你是 Party Night 的安全聚会主持人"); // 证明抓到的是真实 prompt
    expect(sent).not.toMatch(FORBIDDEN);
    expect(prompt).not.toMatch(FORBIDDEN);
  });

  it("自包含直连（无 /api）实际发到 Provider 的 wire body 同样不含这些字段", async () => {
    const session = privacySession();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: JSON.stringify({ cards: cardBatch("direct"), meta: { generatedCount: 10, provider: "p" } }) } }] }),
    } as unknown as Response);

    await generateDeckDirect({
      profile: providerProfile,
      apiKey: "test-key",
      sessionConfig: session.config,
      sessionId: session.id,
      targetCardCount: 10,
    });

    const wire = fetchSpy.mock.calls[0]![1]!.body as string;
    // 抓到的是真实 wire body：URL 在 fetch 首参、正文里有 model/messages
    expect(String(fetchSpy.mock.calls[0]![0])).toContain("api.deepseek.com/chat/completions");
    expect(JSON.parse(wire)).toMatchObject({ model: "deepseek-chat" });
    expect(wire).not.toMatch(FORBIDDEN);
    // 已用假 response 兜住网络层，这里确认没有把真请求发出去
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("1:N / Coverage / Mutual candidate 计算只在本地 Relationship Engine：AI 模块不 import v2-relationship", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const aiModules = [
      "app/api/generate-session/route.ts",
      "lib/ai/prompt-builder.ts",
      "lib/ai/direct-provider.ts",
      "lib/ai/generate-deck.ts",
      "lib/ai/upstream.ts",
    ];
    for (const file of aiModules) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, `${file} 不得 import Relationship Engine`).not.toMatch(/@\/lib\/v2-relationship/);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 2. 日志边界                                                          */
/* ------------------------------------------------------------------ */

describe("R-CB10｜日志不含性别 / anchor / 参与者投影 / 真名", () => {
  it("失败路径确实产生了日志，且日志里没有任何敏感字段（非空跑）", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    callProviderMock.mockResolvedValue({ status: 200, body: JSON.stringify({ cards: "nope" }) }); // schema 不合法 → 触发 route 的 console.error

    const session = privacySession();
    const response = await POST(new Request("http://localhost/api/generate-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-key" },
      body: JSON.stringify({ profile: providerProfile, sessionConfig: session.config, session: session, targetCardCount: 10, sessionId: session.id }),
    }));
    expect(response.status).toBe(502); // 走到失败分支
    expect(errors.mock.calls.length).toBeGreaterThan(0); // 确有日志可审

    const logged = JSON.stringify(errors.mock.calls);
    expect(logged).toContain("schema issues");
    expect(logged).not.toMatch(FORBIDDEN);
  });

  it("成功路径的日志同样干净", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    callProviderMock.mockResolvedValue({ status: 200, body: JSON.stringify({ cards: cardBatch("ok"), meta: { generatedCount: 10, provider: "p" } }) });
    const session = privacySession();
    await POST(new Request("http://localhost/api/generate-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-key" },
      body: JSON.stringify({ profile: providerProfile, sessionConfig: session.config, session: session, targetCardCount: 10, sessionId: session.id }),
    }));
    expect(JSON.stringify(errors.mock.calls)).not.toMatch(FORBIDDEN);
  });
});

/* ------------------------------------------------------------------ */
/* 3. 单向原始选择不进入外发序列化 / 存储                                  */
/* ------------------------------------------------------------------ */

describe("R-CB10｜单向原始选择不落入 Session / 存储 / 对外序列化", () => {
  const participants: SessionParticipant[] = [
    { playerId: "p1", active: true, pairGender: "male" },
    { playerId: "p2", active: true, pairGender: "female" },
    { playerId: "p3", active: true, pairGender: "female" },
    { playerId: "p4", active: true, pairGender: "female" },
  ];
  const TS = "2026-01-01T00:00:00.000Z";

  it("跑完一次单向互选：原始选择不落盘、不落 Session、不出现在外发序列化里", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const openSpy = vi.spyOn(IDBFactory.prototype, "open");

    const run = beginMutualCheckRun(participants);
    // p2 点「愿意」→ 唯一候选 p1（单向；p1 未回应）
    submitMutualChoice(run, "p2", "p1");
    const result = finalizeMutualCheckRun(run, createInitialRelationshipState());
    const events = mutualCheckFinalEvents(run.runId, 9, result, TS);

    // Session 落盘形状（withV2State 的真实产物）+ 外发事件：不得带单向明细
    const base = { ...privacySession(), relationshipState: createInitialRelationshipState() };
    const session = withV2State(base, reduceV2SessionEvents({
      ...createV2SessionState({ sessionId: "s-privacy", participants }),
      relationship: relationshipOf(base),
    }, events).state);
    const outward = JSON.stringify({ session, events, result });

    // 单向无 MATCH、无 COMPLETE 事件；原始选择结构（mutual-pick / selections / maskRevealed）一处不落
    expect(result.matches).toEqual([]);
    expect(events.map((event) => event.type)).toEqual(["SYSTEM_MUTUAL_CHECK_DUE"]);
    expect(outward).not.toMatch(/mutual-pick|selections|maskRevealed/);
    expect(setItem).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("反向对照：双向愿意才会把公开 MATCH 写进 Session（证明上面的「没有」不是管道不通）", () => {
    const run = beginMutualCheckRun(participants);
    submitMutualChoice(run, "p2", "p1");
    submitMutualChoice(run, "p1", "p2");
    const result = finalizeMutualCheckRun(run, createInitialRelationshipState());
    const events = mutualCheckFinalEvents(run.runId, 9, result, TS);

    const base = { ...privacySession(), relationshipState: createInitialRelationshipState() };
    const session = withV2State(base, reduceV2SessionEvents({
      ...createV2SessionState({ sessionId: "s-privacy", participants }),
      relationship: relationshipOf(base),
    }, events).state);

    expect(result.matches.map((item) => item.pairKey)).toEqual(["p1::p2"]);
    expect(events.map((event) => event.type)).toEqual(["SYSTEM_MUTUAL_CHECK_DUE", "SYSTEM_MUTUAL_CHECK_COMPLETE"]);
    expect(Object.keys(session.relationshipState!.matches)).toEqual(["p1::p2"]);
    // 公开结果里只有 pair 与玩家 id，仍然没有单向选择痕迹
    expect(JSON.stringify({ session, events, result })).not.toMatch(/mutual-pick|selections|maskRevealed/);
  });
});
