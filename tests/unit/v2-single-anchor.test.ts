/**
 * B2b｜Single-Anchor Guard（R-CB6）＋ 多数方 Coverage（R-CB8）＋ 与 D7 的两层消解（R-CB7）
 *
 * 覆盖用户 V1.2 §六 与 CHANGE-B 的 DoD 硬断言 1–8、15（routing 部分），并落 7 组固定 fixture：
 *   1男3女 / 1女3男 / 1男4女 / 1男5女 ×20 opportunity；回归 2男2女 / 2男3女 / 3男2女 ×20。
 *
 * 三条口径（本文件里的 stub / harness 与产品代码一一对应）：
 * 1. 「定向轮」= 本轮经 Pair Routing 进入 pair opportunity（`targetPairKey !== null`）；
 *    「非定向轮」= 同一层的反面（`targetPairKey === null`，Router 只出 `all-players` 卡，
 *    见 v2-router `isTargetEligible`）——沿用现有 router 口径，不另立卡类型体系。
 * 2. Exposure 以**展示**为准（`orchestration.lastTargetedPairKey`，展示那一刻即写），不看
 *    completed / skipped 终态；reducer 的 `offeredTargeted` 计数时机未改（已知时序差）。
 * 3. fixture 的 offered 归属：定向轮把这次机会记到「非 anchor 那一端」的多数方玩家
 *    （单点定向卡口径），非定向轮不记（全桌卡无单点归属）。这一步只喂现有
 *    `relationship.playerCoverage`，不新写任何权重。
 *
 * 全部用本地 fixture，固定卡池、无随机、可重放；不发任何 AI 请求。
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import {
  type GameCard,
  type GameSession,
  type Player,
  type SessionConfig,
} from "@/lib/domain/schemas";
import { createSession } from "@/lib/engine/session-engine";
import { createDeckRouter, drawDeckCard, orchestrationOf, withV2State } from "@/lib/engine/v2-deal";
import { migrateSessionRecord } from "@/lib/storage/session-migration";
import {
  V2_MAINLINE_PACK_IDS,
  mainlineSsotCards,
  mainlineSsotCardsByPack,
} from "@/lib/v2-content/v2-card-bridge";
import { getV2ContentAdapter } from "@/lib/v2-content/v2-content-adapter";
import { eligiblePairKeys } from "@/lib/v2-relationship/v2-participants";
import { createV2MainlineRouter } from "@/lib/v2-relationship/v2-router";
import {
  SINGLE_ANCHOR_TABLE,
  genderCounts,
  rankPairs,
  singleAnchorPlayerId,
} from "@/lib/v2-relationship/v2-routing";
import {
  NO_LEGAL_NON_TARGETED_CANDIDATE,
  createV2SessionState,
  drawV2SessionCard,
  reduceV2SessionEvents,
  signalsFromRelationship,
  type V2CardOutcome,
  type V2DrawOutcome,
  type V2RouterCard,
  type V2RouterInput,
  type V2RouterPort,
  type V2SessionState,
  type V2SingleAnchorGuard,
  type V2SingleAnchorGuardReason,
} from "@/lib/v2-relationship/v2-session";
import {
  createInitialRelationshipState,
  heatForEffectiveCount,
  type Heat,
  type PlayerCoverage,
  type RelationshipState,
  type SessionParticipant,
} from "@/lib/v2-relationship/v2-state";

/* ------------------------------------------------------------------ */
/* 装置：参与者 / Coverage / fixture Router                                */
/* ------------------------------------------------------------------ */

const male = (playerId: string): SessionParticipant => ({ playerId, active: true, pairGender: "male" });
const female = (playerId: string): SessionParticipant => ({
  playerId,
  active: true,
  pairGender: "female",
});

/** m1..mk + f1..fk（顺序固定，便于逐轮复现）。 */
const anchorTable = (males: number, females: number): SessionParticipant[] => [
  ...Array.from({ length: males }, (_, i) => male(`m${i + 1}`)),
  ...Array.from({ length: females }, (_, i) => female(`f${i + 1}`)),
];

const cov = (overrides: Partial<PlayerCoverage> = {}): PlayerCoverage => ({
  offeredTargeted: 0,
  completedTargeted: 0,
  consecutiveTargetedSkips: 0,
  lowParticipation: false,
  ...overrides,
});

const PAIR_PREFIX = "P:";
const FIVE_PREFIX = "F5:";
const NON_TARGETED_PREFIX = "NT-";

interface FixtureOptions {
  /** 每个合法 pair 提供多少张定向卡（强度 3），保证 20 轮不把牌打空。 */
  cardsPerPair?: number;
  /** 非定向卡数量（强度 1）；0 = 完全没有非定向候选（受控 bypass 用）。 */
  nonTargetedCount?: number;
  /** 是否提供合法 5 档卡（每 pair 一张，强度 5）。 */
  fiveTierPerPair?: boolean;
}

interface FixtureCardSpec {
  id: string;
  intensity: number;
}

/**
 * fixture Router：**镜像现有 Router 的过滤口径**（v2-router `isTargetEligible`）——
 * - `requireNonTargetedOpportunity === true` → 只出非定向卡；
 * - 否则 `targetPairKey === null` → 只出非定向卡（D4 降级口径）；
 * - `targetPairKey !== null` → 定向卡 + 非定向卡同场，按强度降序（定向卡强度更高 → 定向轮展示定向卡）。
 * 另叠 used / 强度上限 / `requireFiveTierForPair` / 软去重窗口（bucket 才套窗口，pack/global 不套）。
 */
function fixtureCandidates(input: V2RouterInput, options: Required<FixtureOptions>): FixtureCardSpec[] {
  const specs: FixtureCardSpec[] = [];
  for (let n = 1; n <= options.nonTargetedCount; n += 1) {
    specs.push({ id: `${NON_TARGETED_PREFIX}${String(n).padStart(2, "0")}`, intensity: 1 });
  }
  const nonTargetedOnly = input.requireNonTargetedOpportunity === true || input.targetPairKey === null;
  if (!nonTargetedOnly) {
    for (const key of eligiblePairKeys(input.participants)) {
      for (let n = 1; n <= options.cardsPerPair; n += 1) {
        specs.push({ id: `${PAIR_PREFIX}${key}#${String(n).padStart(2, "0")}`, intensity: 3 });
      }
      if (options.fiveTierPerPair) specs.push({ id: `${FIVE_PREFIX}${key}`, intensity: 5 });
    }
  }
  return specs;
}

function fixtureRouter(options: FixtureOptions = {}): V2RouterPort {
  const resolved: Required<FixtureOptions> = {
    cardsPerPair: 24,
    nonTargetedCount: 24,
    fiveTierPerPair: true,
    ...options,
  };

  const eligible = (input: V2RouterInput): FixtureCardSpec[] =>
    fixtureCandidates(input, resolved)
      .filter((card) => card.intensity <= input.intensityLimit)
      .filter((card) => input.requireFiveTierForPair === null || card.intensity === 5)
      .filter((card) => !input.relationship.usedCardIds.includes(card.id));

  const buckets = (input: V2RouterInput): FixtureCardSpec[] => {
    const recent =
      input.softDedupWindow > 0
        ? new Set(input.relationship.recentCardIds.slice(-input.softDedupWindow))
        : new Set<string>();
    return eligible(input).filter((card) => !recent.has(card.id));
  };

  const order = (cards: FixtureCardSpec[]): V2RouterCard[] =>
    [...cards]
      .sort((a, b) => b.intensity - a.intensity || (a.id < b.id ? -1 : 1))
      .map((card) => ({ cardId: card.id, fiveTier: card.intensity === 5 }));

  return {
    bucket: (input) => order(buckets(input)),
    pack: (input) => order(eligible(input)),
    global: (input) => order(eligible(input)),
  };
}

const isTargetedCard = (cardId: string): boolean =>
  cardId.startsWith(PAIR_PREFIX) || cardId.startsWith(FIVE_PREFIX);

const asCard = (out: V2DrawOutcome): V2CardOutcome => {
  if (out.kind !== "CARD") throw new Error(`expected CARD, got ${out.kind}`);
  return out;
};

/** 多数方端点（非 anchor 那一端）；无 anchor 时取 pairKey 首位。 */
function majorityEndpoint(targetPairKey: string, anchorPlayerId: string | null): string {
  const [a, b] = targetPairKey.split("::");
  return anchorPlayerId === a ? b : a;
}

/* ------------------------------------------------------------------ */
/* 轨迹 harness：20 次 opportunity + 逐轮记录（候选/展示卡/target/Coverage/D7/Heat） */
/* ------------------------------------------------------------------ */

interface RoundTrace {
  round: number;
  legalPairs: string[];
  outcomeKind: V2DrawOutcome["kind"];
  targetPairKey: string | null;
  cardId: string | null;
  targeted: boolean;
  anchorTargeted: boolean;
  nonDirected: boolean;
  guard: V2SingleAnchorGuard;
  guardReason: V2SingleAnchorGuardReason | null;
  guardApplied: boolean;
  /** 展示前的输入快照（调度器看到的 Coverage / D7 / Heat）。 */
  coverageOffered: Record<string, number>;
  guarantee: Record<string, string>;
  heat: Heat;
  effectiveCount: number;
  /** 本轮终态归约后的快照（用于证明非定向轮不动 D7）。 */
  guaranteeAfter: Record<string, string>;
  coverageAfter: Record<string, number>;
}

const coverageOffered = (relationship: RelationshipState): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [playerId, coverage] of Object.entries(relationship.playerCoverage)) {
    out[playerId] = coverage.offeredTargeted;
  }
  return out;
};

const guaranteeSummary = (relationship: RelationshipState): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [key, guarantee] of Object.entries(relationship.fiveGuarantees)) {
    out[key] = guarantee.tracker
      ? `${guarantee.tracker.status}/${guarantee.tracker.qualifyingOpportunitiesSeen}`
      : "none";
  }
  return out;
};

function runOpportunities(input: {
  sessionId: string;
  participants: SessionParticipant[];
  rounds: number;
  terminal: "completed" | "skipped";
  relationship?: RelationshipState;
  fixture?: FixtureOptions;
}): { trace: RoundTrace[]; state: V2SessionState } {
  const base = createV2SessionState({
    sessionId: input.sessionId,
    participants: input.participants,
  });
  let state: V2SessionState = input.relationship ? { ...base, relationship: input.relationship } : base;
  const router = fixtureRouter(input.fixture);
  const trace: RoundTrace[] = [];

  for (let round = 1; round <= input.rounds; round += 1) {
    const anchorPlayerId = singleAnchorPlayerId(state.participants);
    const before = state.relationship;
    const outcome = drawV2SessionCard(state, router, { intensityLimit: 5 });
    const cardId = outcome.kind === "CARD" ? outcome.cardId : null;
    // 只有 CARD 才真正进入/选择过 target pair；耗尽态不改展示事实（曝光由 lastTargetedPairKey 决定）
    const targetPairKey = outcome.kind === "CARD" ? outcome.targetPairKey : null;
    const targeted = cardId !== null && isTargetedCard(cardId);

    let next = outcome.state;
    if (outcome.kind === "CARD") {
      /* 轮次终态 → R3 事件（与 v2-deal `eventForRoundTerminal` 同形）：定向轮把 offered 机会记到
         多数方端点（单点定向归属）；非定向轮不记（全桌卡没有单点归属）。 */
      const offeredPlayerId =
        targetPairKey === null ? undefined : majorityEndpoint(targetPairKey, anchorPlayerId);
      next = reduceV2SessionEvents(next, [
        {
          eventId: `r${round}::${input.terminal}`,
          type: input.terminal === "completed" ? "REL_CARD_COMPLETED" : "REL_CARD_SKIPPED",
          ref: `r${round}`,
          cardId: outcome.cardId,
          ...(offeredPlayerId ? { playerId: offeredPlayerId } : {}),
        },
      ]).state;
    }

    trace.push({
      round,
      legalPairs: eligiblePairKeys(state.participants),
      outcomeKind: outcome.kind,
      targetPairKey,
      cardId,
      targeted,
      anchorTargeted:
        targeted &&
        anchorPlayerId !== null &&
        targetPairKey !== null &&
        targetPairKey.split("::").includes(anchorPlayerId),
      nonDirected: targetPairKey === null,
      guard: outcome.guard,
      guardReason: outcome.guard.reason,
      guardApplied: outcome.guard.applied,
      coverageOffered: coverageOffered(before),
      guarantee: guaranteeSummary(before),
      heat: before.heat,
      effectiveCount: before.relationshipEffectiveCardCount,
      guaranteeAfter: guaranteeSummary(next.relationship),
      coverageAfter: coverageOffered(next.relationship),
    });

    if (outcome.kind !== "CARD") break;
    state = next;
  }

  return { trace, state };
}

function summarize(trace: RoundTrace[]): {
  rounds: number;
  pairOpportunities: number;
  nonDirectedRounds: number;
  nonDirectedRatio: number;
  maxConsecutiveAnchorTargeted: number;
  focusedRounds: number;
} {
  let maxConsecutiveAnchorTargeted = 0;
  let run = 0;
  for (const entry of trace) {
    run = entry.anchorTargeted ? run + 1 : 0;
    maxConsecutiveAnchorTargeted = Math.max(maxConsecutiveAnchorTargeted, run);
  }
  const pairOpportunities = trace.filter((entry) => entry.targetPairKey !== null).length;
  const nonDirectedRounds = trace.filter((entry) => entry.nonDirected).length;
  return {
    rounds: trace.length,
    pairOpportunities,
    nonDirectedRounds,
    nonDirectedRatio: trace.length === 0 ? 0 : nonDirectedRounds / trace.length,
    maxConsecutiveAnchorTargeted,
    focusedRounds: trace.filter((entry) => entry.anchorTargeted).length,
  };
}

const SINGLE_ANCHOR_FIXTURES: ReadonlyArray<{ label: string; males: number; females: number }> = [
  { label: "1男3女", males: 1, females: 3 },
  { label: "1女3男", males: 3, females: 1 },
  { label: "1男4女", males: 1, females: 4 },
  { label: "1男5女", males: 1, females: 5 },
];

const ORDINARY_FIXTURES: ReadonlyArray<{ label: string; males: number; females: number }> = [
  { label: "2男2女", males: 2, females: 2 },
  { label: "2男3女", males: 2, females: 3 },
  { label: "3男2女", males: 3, females: 2 },
];

/* ------------------------------------------------------------------ */
/* ① / ② 识别与不误触发                                                    */
/* ------------------------------------------------------------------ */

describe("R-CB6｜Single-Anchor 桌识别（DoD 1–2）", () => {
  it("① min==1 && max>=3 才识别；anchor = 少数方；null / inactive 一律不计入", () => {
    // 触发表是显式常量（审计/测试同源）：两行 = 少数方为男 / 为女
    expect(SINGLE_ANCHOR_TABLE).toHaveLength(2);
    expect(SINGLE_ANCHOR_TABLE.map((row) => row.anchorGender)).toEqual(["male", "female"]);
    expect(SINGLE_ANCHOR_TABLE.every((row) => row.anchorCount === 1)).toBe(true);
    expect(SINGLE_ANCHOR_TABLE.every((row) => row.majorityCountMin === 3)).toBe(true);

    for (const [males, females] of [
      [1, 3],
      [1, 4],
      [1, 5],
      [1, 6],
    ] as const) {
      expect(genderCounts(anchorTable(males, females))).toEqual({ male: males, female: females });
      expect(singleAnchorPlayerId(anchorTable(males, females)), `${males}男${females}女`).toBe("m1");
    }
    for (const [males, females] of [
      [3, 1],
      [4, 1],
      [5, 1],
      [6, 1],
    ] as const) {
      expect(singleAnchorPlayerId(anchorTable(males, females)), `${males}男${females}女`).toBe("f1");
    }

    // pairGender=null 不计入任何一方：若被猜成女方，1男2女会误判成 1男3女（Guard 误触发）
    const withUnset: SessionParticipant[] = [
      male("m1"),
      female("f1"),
      female("f2"),
      { playerId: "x", active: true, pairGender: null },
    ];
    expect(genderCounts(withUnset)).toEqual({ male: 1, female: 2 });
    expect(singleAnchorPlayerId(withUnset)).toBeNull();

    // inactive 不计入：若把离席的 f3 计入，1男2女会误判成 1男3女
    const withAway: SessionParticipant[] = [
      male("m1"),
      female("f1"),
      female("f2"),
      { playerId: "f3", active: false, pairGender: "female" },
    ];
    expect(singleAnchorPlayerId(withAway)).toBeNull();

    // 边界：max < 3 不触发
    expect(singleAnchorPlayerId(anchorTable(1, 1))).toBeNull();
    expect(singleAnchorPlayerId(anchorTable(1, 2))).toBeNull();
    expect(singleAnchorPlayerId([])).toBeNull();
  });

  it("② 2:N / N:2 普通桌不触发（识别 + 20 轮调度 Guard 恒 false）", () => {
    for (const [males, females] of [
      [2, 2],
      [2, 3],
      [3, 2],
      [2, 5],
      [5, 2],
      [3, 3],
    ] as const) {
      expect(singleAnchorPlayerId(anchorTable(males, females)), `${males}男${females}女`).toBeNull();
    }

    for (const fixture of ORDINARY_FIXTURES) {
      const { trace } = runOpportunities({
        sessionId: `sa-2-${fixture.label}`,
        participants: anchorTable(fixture.males, fixture.females),
        rounds: 20,
        terminal: "skipped",
      });
      expect(trace).toHaveLength(20);
      expect(
        trace.every(
          (entry) =>
            entry.guard.singleAnchorTable === false &&
            entry.guardApplied === false &&
            entry.guardReason === null &&
            entry.anchorTargeted === false,
        ),
        `${fixture.label} Guard 不应当触发`,
      ).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* ③ / ④ 曝光与间隔                                                        */
/* ------------------------------------------------------------------ */

describe("R-CB6｜Anchor Exposure（展示即曝光，DoD 3–4）", () => {
  it("③ anchor targeted 后下一张不是 anchor targeted（4 组 Single-Anchor 20 轮）", () => {
    for (const fixture of SINGLE_ANCHOR_FIXTURES) {
      const { trace } = runOpportunities({
        sessionId: `sa-3-${fixture.label}`,
        participants: anchorTable(fixture.males, fixture.females),
        rounds: 20,
        terminal: "skipped",
      });
      const stats = summarize(trace);

      expect(stats.rounds).toBe(20);
      // 禁止 anchor+A → anchor+B → anchor+C：anchor targeted 永不连续
      expect(stats.maxConsecutiveAnchorTargeted, `${fixture.label}`).toBe(1);
      expect(stats.focusedRounds, `${fixture.label}`).toBeGreaterThan(0);
      // 逐轮：上一轮 anchor targeted ⇒ 本轮 Guard 生效且本轮不是定向轮
      for (let index = 1; index < trace.length; index += 1) {
        if (!trace[index - 1].anchorTargeted) continue;
        expect(trace[index].guardApplied, `${fixture.label} 第${trace[index].round}轮`).toBe(true);
        expect(trace[index].targetPairKey).toBeNull();
        expect(trace[index].targeted).toBe(false);
      }
      // Guard 生效的轮次：target 为 null 且展示卡不是定向卡（真的换了一类卡）
      for (const entry of trace.filter((item) => item.guardApplied)) {
        expect(entry.targetPairKey, `${fixture.label} 第${entry.round}轮`).toBeNull();
        expect(entry.targeted, `${fixture.label} 第${entry.round}轮`).toBe(false);
      }
    }
  });

  it("④ targeted 展示即 Exposure；跳过/完成都不撤销 Guard，且 skip 不制造 Signal", () => {
    const participants = anchorTable(1, 3);
    const router = fixtureRouter();
    const base = createV2SessionState({ sessionId: "sa-4", participants });

    const first = asCard(drawV2SessionCard(base, router, { intensityLimit: 5 }));
    expect(first.guard.applied).toBe(false);
    expect(first.targetPairKey).toBe("f1::m1");
    expect(isTargetedCard(first.cardId)).toBe(true);
    // 展示那一刻就记下曝光事实（不等 completed / skipped）
    expect(first.state.orchestration.lastTargetedPairKey).toBe("f1::m1");

    const skipped = reduceV2SessionEvents(first.state, [
      { eventId: "r1::skipped", type: "REL_CARD_SKIPPED", ref: "r1", cardId: first.cardId, playerId: "f1" },
    ]).state;
    // skip 不制造 Signal（pairState / 路由信号逐条不变），也不推进计数与 Heat
    expect(skipped.relationship.pairState).toEqual(first.state.relationship.pairState);
    expect(signalsFromRelationship(skipped.relationship)).toEqual(
      signalsFromRelationship(first.state.relationship),
    );
    expect(skipped.relationship.relationshipEffectiveCardCount).toBe(0);
    expect(skipped.relationship.heat).toBe("H1");
    // skip 不撤销曝光 → 下一轮 Guard 依然生效
    expect(skipped.orchestration.lastTargetedPairKey).toBe("f1::m1");

    const second = asCard(drawV2SessionCard(skipped, router, { intensityLimit: 5 }));
    expect(second.guard.applied).toBe(true);
    expect(second.targetPairKey).toBeNull();
    expect(isTargetedCard(second.cardId)).toBe(false);

    // completed 同样不撤销曝光（曝光只看展示，不看终态；reducer 的 offered 计数时机未改）
    const completed = reduceV2SessionEvents(first.state, [
      { eventId: "r1::completed", type: "REL_CARD_COMPLETED", ref: "r1", cardId: first.cardId, playerId: "f1" },
    ]).state;
    expect(completed.orchestration.lastTargetedPairKey).toBe("f1::m1");
    expect(completed.relationship.playerCoverage["f1"]?.offeredTargeted).toBe(1);
    const third = asCard(drawV2SessionCard(completed, router, { intensityLimit: 5 }));
    expect(third.guard.applied).toBe(true);
    expect(third.targetPairKey).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* ⑤ 多数方 Coverage（复用 B2a 软排序）                                     */
/* ------------------------------------------------------------------ */

describe("R-CB8｜多数方 Coverage（DoD 5）", () => {
  it("⑤ 未获 targeted offered 的多数方先于已获者（复用 B2a 权重，不另写）", () => {
    const participants = anchorTable(1, 3);
    // 排序层：f1 / m1 已获 offered → 未获机会的 f2 / f3 相关 pair 排前面
    const coverage = {
      f1: cov({ offeredTargeted: 2, completedTargeted: 2 }),
      m1: cov({ offeredTargeted: 2 }),
    };
    const ranked = rankPairs(participants, {}, new Set<string>(), {}, coverage);
    expect(ranked.indexOf("f2::m1")).toBeLessThan(ranked.indexOf("f1::m1"));
    expect(ranked.indexOf("f3::m1")).toBeLessThan(ranked.indexOf("f1::m1"));

    // 轨迹层：前 3 个 pair opportunity 的多数方端点两两不同（谁都没被连续集中）
    const { trace } = runOpportunities({
      sessionId: "sa-5",
      participants,
      rounds: 20,
      terminal: "skipped",
    });
    const pairRounds = trace.filter((entry) => entry.targetPairKey !== null);
    expect(pairRounds.length).toBeGreaterThanOrEqual(3);
    expect(pairRounds[0].targetPairKey).toBe("f1::m1");
    const firstThree = pairRounds
      .slice(0, 3)
      .map((entry) => majorityEndpoint(entry.targetPairKey as string, "m1"));
    expect(new Set(firstThree)).toEqual(new Set(["f1", "f2", "f3"]));
    // skip 也算已获 offered（Coverage 真的在推进）
    expect(trace[2].coverageOffered["f1"]).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* ⑥ / ⑦ 与 D7 的两层消解                                                 */
/* ------------------------------------------------------------------ */

const withPendingTracker = (seen: number): RelationshipState => ({
  ...createInitialRelationshipState(),
  fiveGuarantees: {
    "f1::m1": {
      pairKey: "f1::m1",
      tracker: {
        status: "pending",
        qualifyingOpportunitiesSeen: seen,
        qualifyingOpportunitiesLimit: 2,
        createdAtEffectiveCount: 0,
      },
    },
  },
});

describe("R-CB7｜Guard 与 D7 两层消解（DoD 6–7）", () => {
  it("⑥ 第一层：非定向轮不计 qualifying，D7 pending 原封不动（不清零、不消耗）", () => {
    const participants = anchorTable(1, 3);
    const base = createV2SessionState({ sessionId: "sa-6", participants });
    const state: V2SessionState = {
      ...base,
      relationship: withPendingTracker(1),
      // 上轮已展示 anchor 的定向 pair → 本轮 Guard 生效
      orchestration: { ...base.orchestration, lastTargetedPairKey: "f1::m1" },
    };

    const out = asCard(drawV2SessionCard(state, fixtureRouter(), { intensityLimit: 5 }));

    expect(out.guard.applied).toBe(true);
    expect(out.guard.reason).toBeNull();
    expect(out.targetPairKey).toBeNull(); // 先走非定向轮
    expect(out.guaranteeAdvance).toBe("none"); // 本轮没有 D7 判定
    expect(out.state.relationship.fiveGuarantees["f1::m1"]).toEqual(
      state.relationship.fiveGuarantees["f1::m1"],
    );
    expect(out.state.relationship.fiveGuarantees["f1::m1"].tracker?.status).toBe("pending");
    expect(out.state.relationship.fiveGuarantees["f1::m1"].tracker?.qualifyingOpportunitiesSeen).toBe(1);
  });

  it("⑦a 第二层：真正进入 pair opportunity 后，seen>=1 强制合法 5 档，展示即 offered", () => {
    const participants = anchorTable(1, 3);
    const base = createV2SessionState({ sessionId: "sa-7a", participants });
    const state: V2SessionState = { ...base, relationship: withPendingTracker(1) };

    const inputs: V2RouterInput[] = [];
    const router = fixtureRouter();
    const spy: V2RouterPort = {
      bucket: (input) => {
        inputs.push(input);
        return router.bucket(input);
      },
      pack: (input) => router.pack(input),
      global: (input) => router.global(input),
    };

    const out = asCard(drawV2SessionCard(state, spy, { intensityLimit: 5 }));

    expect(out.targetPairKey).toBe("f1::m1");
    // D7 在已选中的 pair opportunity 内优先于 Coverage / Signal 排序：5 档是硬过滤
    expect(inputs.some((input) => input.requireFiveTierForPair === "f1::m1")).toBe(true);
    expect(
      inputs.every(
        (input) =>
          input.requireFiveTierForPair === null || input.requireFiveTierForPair === "f1::m1",
      ),
    ).toBe(true);
    expect(out.cardId).toBe("F5:f1::m1");
    expect(out.guaranteeAdvance).toBe("present");
    expect(out.state.relationship.fiveGuarantees["f1::m1"].tracker?.status).toBe("offered");
  });

  it("⑦b 第 1 次合格机会不强制 5 档（不越权），展示 5 档即 offered", () => {
    const participants = anchorTable(1, 3);
    const base = createV2SessionState({ sessionId: "sa-7b", participants });
    const state: V2SessionState = { ...base, relationship: withPendingTracker(0) };

    const inputs: V2RouterInput[] = [];
    const router = fixtureRouter();
    const spy: V2RouterPort = {
      bucket: (input) => {
        inputs.push(input);
        return router.bucket(input);
      },
      pack: (input) => router.pack(input),
      global: (input) => router.global(input),
    };

    const out = asCard(drawV2SessionCard(state, spy, { intensityLimit: 5 }));

    // seen=0 → 不强制 5 档（requireFiveTierForPair 恒 null），但 5 档可出时仍按强度降序先出
    expect(inputs.every((input) => input.requireFiveTierForPair === null)).toBe(true);
    expect(out.cardId).toBe("F5:f1::m1");
    expect(out.guaranteeAdvance).toBe("present");
    expect(out.state.relationship.fiveGuarantees["f1::m1"].tracker?.status).toBe("offered");
  });

  it("⑦c 无合法 5 档 → D7 暂停且不消耗合格机会（不靠改 D7 定义掩盖）", () => {
    const participants = anchorTable(1, 3);
    const base = createV2SessionState({ sessionId: "sa-7c", participants });
    const state: V2SessionState = { ...base, relationship: withPendingTracker(1) };

    const out = asCard(
      drawV2SessionCard(state, fixtureRouter({ fiveTierPerPair: false }), { intensityLimit: 5 }),
    );

    expect(out.targetPairKey).toBe("f1::m1");
    expect(out.guaranteeAdvance).toBe("pause");
    const tracker = out.state.relationship.fiveGuarantees["f1::m1"].tracker;
    expect(tracker).not.toBeNull();
    expect(tracker?.status).toBe("paused");
    expect(tracker?.pauseReason).toBe("no-legal-five-card");
    expect(tracker?.qualifyingOpportunitiesSeen).toBe(1);
  });

  it("⑦d 两层串起来：qualify → Guard 非定向轮不动它 → 第 2 次合格机会强制 present（不出现 seen=2 且非 offered）", () => {
    const participants = anchorTable(1, 3);
    const base = createV2SessionState({ sessionId: "sa-7d", participants });
    const state: V2SessionState = { ...base, relationship: withPendingTracker(0) };
    // 非定向轮给 NT-1；定向轮未强制时队列首位是非 5 档、但桶里有合法 5 档（本轮合格机会成立）。
    const router: V2RouterPort = {
      bucket: (input) => {
        if (input.requireNonTargetedOpportunity === true) return [{ cardId: "NT-1", fiveTier: false }];
        return input.requireFiveTierForPair === null
          ? [
              { cardId: "LOW-1", fiveTier: false },
              { cardId: "FIVE-1", fiveTier: true },
            ]
          : [{ cardId: "FIVE-1", fiveTier: true }];
      },
      pack: () => [{ cardId: "LOW-1", fiveTier: false }, { cardId: "FIVE-1", fiveTier: true }],
      global: () => [{ cardId: "LOW-1", fiveTier: false }, { cardId: "FIVE-1", fiveTier: true }],
    };

    // 第 1 次合格机会：展示的不是 5 档 → 只累计 seen=1（pending 保持）
    const first = asCard(drawV2SessionCard(state, router, { intensityLimit: 5 }));
    expect(first.cardId).toBe("LOW-1");
    expect(first.guaranteeAdvance).toBe("qualify");
    expect(first.state.relationship.fiveGuarantees["f1::m1"].tracker?.status).toBe("pending");
    expect(first.state.relationship.fiveGuarantees["f1::m1"].tracker?.qualifyingOpportunitiesSeen).toBe(1);

    // 第 2 轮（第一层）：Guard 生效 → 非定向轮，不计机会、tracker 一格不动
    const guarded = asCard(drawV2SessionCard(first.state, router, { intensityLimit: 5 }));
    expect(guarded.guard.applied).toBe(true);
    expect(guarded.targetPairKey).toBeNull();
    expect(guarded.cardId).toBe("NT-1");
    expect(guarded.guaranteeAdvance).toBe("none");
    expect(guarded.state.relationship.fiveGuarantees["f1::m1"]).toEqual(
      first.state.relationship.fiveGuarantees["f1::m1"],
    );

    // 第 3 轮（第二层）：回到 pair opportunity → 第 2 次合格机会强制合法 5 档 → 展示即 offered
    const second = asCard(drawV2SessionCard(guarded.state, router, { intensityLimit: 5 }));
    expect(second.cardId).toBe("FIVE-1");
    expect(second.guaranteeAdvance).toBe("present");
    const tracker = second.state.relationship.fiveGuarantees["f1::m1"].tracker;
    expect(tracker).not.toBeNull();
    expect(tracker?.status).toBe("offered");
    expect(tracker?.qualifyingOpportunitiesSeen).toBe(1); // 展示即终态，不出现 seen=2 且非 offered
  });

  it("⑦e 20 轮轨迹：D7 只在真正的 pair opportunity 轮推进，非定向轮一格不动", () => {
    const participants = anchorTable(1, 3);
    const { trace } = runOpportunities({
      sessionId: "sa-7e",
      participants,
      rounds: 20,
      terminal: "skipped",
      relationship: withPendingTracker(1),
    });

    // 第 1 轮就是 f1::m1 的 pair opportunity（seen=1 → 强制 5 档 → offered）
    expect(trace[0].targetPairKey).toBe("f1::m1");
    expect(trace[0].guarantee["f1::m1"]).toBe("pending/1");
    expect(trace[0].guaranteeAfter["f1::m1"]).toBe("offered/1");

    // 非定向轮：终态归约后 tracker 与上一轮完全一致（不进 D7、不清零、不消耗）
    expect(trace[1].nonDirected).toBe(true);
    for (let index = 1; index < trace.length; index += 1) {
      if (!trace[index].nonDirected) continue;
      expect(trace[index].guaranteeAfter["f1::m1"], `第${trace[index].round}轮`).toBe(
        trace[index - 1].guaranteeAfter["f1::m1"],
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/* ⑧ 受控 bypass（有限步、不死锁）                                          */
/* ------------------------------------------------------------------ */

describe("R-CB7｜无非定向候选的受控 bypass（DoD 8）", () => {
  it("⑧ reason 是显式常量；有卡可出时 bypass 后照常出定向卡，且连续多轮有限步返回", () => {
    expect(NO_LEGAL_NON_TARGETED_CANDIDATE).toBe("NO_LEGAL_NON_TARGETED_CANDIDATE");

    const participants = anchorTable(1, 3);
    const base = createV2SessionState({ sessionId: "sa-8", participants });
    let state: V2SessionState = {
      ...base,
      orchestration: { ...base.orchestration, lastTargetedPairKey: "f1::m1" },
    };
    // 完全没有非定向卡，但定向卡充足 → 受控 bypass
    const router = fixtureRouter({ nonTargetedCount: 0 });

    for (let round = 1; round <= 6; round += 1) {
      const out = drawV2SessionCard(state, router, { intensityLimit: 5 });
      expect(out.guard.applied, `第${round}轮`).toBe(true);
      expect(out.guard.reason, `第${round}轮`).toBe(NO_LEGAL_NON_TARGETED_CANDIDATE);
      expect(out.kind, `第${round}轮`).toBe("CARD");
      if (out.kind !== "CARD") return;
      expect(out.targetPairKey).not.toBeNull();
      expect(isTargetedCard(out.cardId)).toBe(true);
      state = out.state;
    }
  });

  it("⑧b 连一张卡都没有时：bypass 落在既有耗尽/等待态，同样带 reason，不死锁", () => {
    const participants = anchorTable(1, 3);
    const base = createV2SessionState({ sessionId: "sa-8b", participants });
    const state: V2SessionState = {
      ...base,
      orchestration: { ...base.orchestration, lastTargetedPairKey: "f1::m1" },
    };
    const router = fixtureRouter({ nonTargetedCount: 0, cardsPerPair: 0, fiveTierPerPair: false });

    const out = drawV2SessionCard(state, router, { intensityLimit: 5 });

    expect(out.kind).toBe("AWAITING_HOST_EXHAUSTION_DECISION");
    expect(out.guard.applied).toBe(true);
    expect(out.guard.reason).toBe(NO_LEGAL_NON_TARGETED_CANDIDATE);
    expect(out.state.orchestration.awaitingHostDecision).toBe(true);
    // 重入仍有限步返回同一等待态（不空转）
    const again = drawV2SessionCard(out.state, router, { intensityLimit: 5 });
    expect(again.kind).toBe("AWAITING_HOST_EXHAUSTION_DECISION");
  });
});

/* ------------------------------------------------------------------ */
/* ⑨ Heat 单调                                                            */
/* ------------------------------------------------------------------ */

describe("Heat 与计数（DoD 9）", () => {
  it("⑨ 20 轮轨迹 Heat 单调不降、等于 heatForEffectiveCount；skip 轮完全不推进", () => {
    for (const fixture of SINGLE_ANCHOR_FIXTURES) {
      const skipped = runOpportunities({
        sessionId: `sa-9-skip-${fixture.label}`,
        participants: anchorTable(fixture.males, fixture.females),
        rounds: 20,
        terminal: "skipped",
      });
      expect(skipped.state.relationship.relationshipEffectiveCardCount).toBe(0);
      expect(skipped.trace.every((entry) => entry.heat === "H1")).toBe(true);

      const completed = runOpportunities({
        sessionId: `sa-9-done-${fixture.label}`,
        participants: anchorTable(fixture.males, fixture.females),
        rounds: 20,
        terminal: "completed",
      });
      const ranks = completed.trace.map((entry) => (["H1", "H2", "H3", "H4"] as Heat[]).indexOf(entry.heat));
      for (let index = 1; index < ranks.length; index += 1) {
        expect(ranks[index], `${fixture.label} 第${index + 1}轮 Heat 回退`).toBeGreaterThanOrEqual(
          ranks[index - 1],
        );
      }
      expect(completed.state.relationship.heat).toBe(
        heatForEffectiveCount(completed.state.relationship.relationshipEffectiveCardCount),
      );
      expect(completed.state.relationship.relationshipEffectiveCardCount).toBe(20);
    }
  });
});

/* ------------------------------------------------------------------ */
/* 7 组 fixture：逐组实测                                                   */
/* ------------------------------------------------------------------ */

describe("7 组固定 fixture（20 opportunity，固定卡池可重放）", () => {
  it("Single-Anchor 4 组：anchor targeted 不连续、非定向轮恰好隔开一轮、候选恒合法", () => {
    for (const fixture of SINGLE_ANCHOR_FIXTURES) {
      const { trace } = runOpportunities({
        sessionId: `fixture-sa-${fixture.label}`,
        participants: anchorTable(fixture.males, fixture.females),
        rounds: 20,
        terminal: "skipped",
      });
      const stats = summarize(trace);
      expect(stats.rounds).toBe(20);
      expect(stats.maxConsecutiveAnchorTargeted, fixture.label).toBe(1);
      // 一轮定向 + 一轮非定向严格交替
      expect(stats.pairOpportunities, fixture.label).toBe(10);
      expect(stats.nonDirectedRounds, fixture.label).toBe(10);
      expect(stats.nonDirectedRatio, fixture.label).toBe(0.5);
      for (const entry of trace) {
        if (entry.targetPairKey !== null) expect(entry.legalPairs).toContain(entry.targetPairKey);
        if (entry.guardApplied) expect(entry.targetPairKey).toBeNull();
        expect(entry.guardReason).toBeNull();
        expect(entry.guard.singleAnchorTable).toBe(true);
        expect(entry.outcomeKind).toBe("CARD");
      }
    }
  });

  it("回归 3 组：Guard 恒 false，选卡与纯 routing 首位逐轮一致，合法性 / Heat / MATCH 无差异", () => {
    for (const fixture of ORDINARY_FIXTURES) {
      const participants = anchorTable(fixture.males, fixture.females);
      const legal = new Set(eligiblePairKeys(participants));
      const router = fixtureRouter();
      let state = createV2SessionState({ sessionId: `fixture-reg-${fixture.label}`, participants });

      for (let round = 1; round <= 20; round += 1) {
        // 改前口径：纯 routing 首位（同一 signal / cooldown / Coverage 输入）
        const expected = rankPairs(
          state.participants,
          signalsFromRelationship(state.relationship),
          new Set(Object.keys(state.relationship.matches)),
          state.relationship.cooldowns,
          state.relationship.playerCoverage,
        )[0];

        const out = asCard(drawV2SessionCard(state, router, { intensityLimit: 5 }));
        expect(out.guard.singleAnchorTable, fixture.label).toBe(false);
        expect(out.guard.applied, fixture.label).toBe(false);
        expect(out.guard.reason, fixture.label).toBeNull();
        expect(out.targetPairKey, `${fixture.label} 第${round}轮`).toBe(expected);
        expect(legal.has(out.targetPairKey as string), `${fixture.label} 第${round}轮非法 pair`).toBe(
          true,
        );

        state = out.state;
        state = reduceV2SessionEvents(state, [
          {
            eventId: `r${round}::skipped`,
            type: "REL_CARD_SKIPPED",
            ref: `r${round}`,
            cardId: out.cardId,
            playerId: majorityEndpoint(out.targetPairKey as string, null),
          },
        ]).state;
      }

      // 全 skip 20 轮：effective / Heat / MATCH 零推进（与改前一致）
      expect(state.relationship.relationshipEffectiveCardCount, fixture.label).toBe(0);
      expect(state.relationship.heat, fixture.label).toBe("H1");
      expect(Object.keys(state.relationship.matches), fixture.label).toEqual([]);
      expect(state.relationship.sessionCompletedRounds, fixture.label).toBe(0);
    }
  });
});

/* ------------------------------------------------------------------ */
/* Router 口径（不另立卡类型体系）                                          */
/* ------------------------------------------------------------------ */

describe("现有 Router 口径：requireNonTargetedOpportunity 只出 all-players", () => {
  const adapter = getV2ContentAdapter();
  const targetModeOf = (cardId: string): string | undefined => {
    const meta = adapter.cardById(cardId);
    return meta && "targetMode" in meta ? meta.targetMode : undefined;
  };

  it("SSOT 主线 Router 与生产 deck Router 同口径（非定向轮只出 all-players）", () => {
    const restricted: V2RouterInput = {
      relationship: createInitialRelationshipState(),
      participants: anchorTable(1, 3),
      targetPairKey: null,
      intensityLimit: 5,
      softDedupWindow: 5,
      requireFiveTierForPair: null,
      requireNonTargetedOpportunity: true,
    };
    const unrestricted: V2RouterInput = {
      ...restricted,
      targetPairKey: "f1::m1",
      requireNonTargetedOpportunity: undefined,
    };

    const mainline = createV2MainlineRouter({ packId: "truth-dare" });
    const guarded = mainline.global(restricted);
    expect(guarded.length).toBeGreaterThan(0);
    expect(guarded.every((card) => targetModeOf(card.cardId) === "all-players")).toBe(true);
    // 对照：不带 Guard 过滤时定向卡可出 → 说明 flag 真的在收窄
    expect(
      mainline.global(unrestricted).some((card) => targetModeOf(card.cardId) !== "all-players"),
    ).toBe(true);

    const deckRouter = createDeckRouter({
      deck: [...mainlineSsotCards()],
      preferredPackIds: [],
      enabledPackIds: [...V2_MAINLINE_PACK_IDS],
    });
    const deckGuarded = deckRouter.bucket(restricted);
    expect(deckGuarded.length).toBeGreaterThan(0);
    expect(deckGuarded.every((card) => targetModeOf(card.cardId) === "all-players")).toBe(true);
  });

  it("非 SSOT 卡（AI / 自定义 / 旧 seed）按非定向候选处理（无 targetMode 元数据即非定向）", () => {
    const localCards: GameCard[] = [
      {
        id: "local-1",
        packId: "truth-dare",
        type: "truth",
        content: "本地题 1",
        intensity: 1,
        tags: [],
        boundaryTags: [],
        minPlayers: 2,
        participantMode: "all",
        source: "builtin",
      },
    ];
    const deckRouter = createDeckRouter({
      deck: localCards,
      preferredPackIds: ["truth-dare"],
      enabledPackIds: ["truth-dare"],
    });
    const cards = deckRouter.bucket({
      relationship: createInitialRelationshipState(),
      participants: anchorTable(1, 3),
      targetPairKey: null,
      intensityLimit: 5,
      softDedupWindow: 5,
      requireFiveTierForPair: null,
      requireNonTargetedOpportunity: true,
    });
    expect(cards.map((card) => card.cardId)).toEqual(["local-1"]);
  });
});

/* ------------------------------------------------------------------ */
/* 旧 Session 恢复 + 结构边界自证                                           */
/* ------------------------------------------------------------------ */

describe("兼容与边界", () => {
  const players: Player[] = [
    { id: "m1", displayName: "男1", active: true, createdAt: "x", lastUsedAt: "x" },
    { id: "f1", displayName: "女1", active: true, createdAt: "x", lastUsedAt: "x" },
    { id: "f2", displayName: "女2", active: true, createdAt: "x", lastUsedAt: "x" },
    { id: "f3", displayName: "女3", active: true, createdAt: "x", lastUsedAt: "x" },
  ];
  const config: SessionConfig = {
    players,
    relationship: "friends",
    vibes: ["funny"],
    intensity: 3,
    boundaries: DEFAULT_BOUNDARIES,
    enabledPackIds: ["truth-dare"],
    mode: "single",
  };

  it("旧 Session 恢复：v2Orchestration 缺 lastTargetedPairKey 也能正常调度（缺省 = 无曝光）", () => {
    const session: GameSession = createSession(
      config,
      [...mainlineSsotCardsByPack("truth-dare")],
      anchorTable(1, 3),
    );
    const first = drawDeckCard({
      session,
      preferredPackIds: ["truth-dare"],
      enabledPackIds: ["truth-dare"],
    });
    expect(first.outcome.kind).toBe("CARD");

    // 上一版落库形态：v2Orchestration 里没有 lastTargetedPairKey（这里刻意带上一个曝光值再删掉，
    // 证明「旧记录缺字段」= 按无曝光处理，而不是继承任何猜测值）
    const current = first.outcome.state;
    const legacyRecord = JSON.parse(
      JSON.stringify({
        ...withV2State(session, {
          ...current,
          orchestration: { ...current.orchestration, lastTargetedPairKey: "f1::m1" },
        }),
        v2Orchestration: {
          softDedupWindow: current.orchestration.softDedupWindow,
          awaitingHostDecision: current.orchestration.awaitingHostDecision,
          lastExhaustionLevel: current.orchestration.lastExhaustionLevel,
          finished: current.orchestration.finished,
          hostDecisions: current.orchestration.hostDecisions,
        },
      }),
    ) as unknown;

    const restored = migrateSessionRecord(legacyRecord);
    expect(restored).toBeDefined();
    expect(orchestrationOf(restored!).lastTargetedPairKey).toBeNull();

    const { outcome } = drawDeckCard({
      session: restored!,
      preferredPackIds: ["truth-dare"],
      enabledPackIds: ["truth-dare"],
    });
    expect(outcome.kind).toBe("CARD");
    expect(outcome.guard.applied).toBe(false); // 缺字段 = 无曝光 → Guard 不介入
    expect(outcome.guard.singleAnchorTable).toBe(true); // 1男3女 仍是 Single-Anchor 桌
  });

  it("边界自证：曝光只落在编排态，RelationshipState 字段结构一行未动", () => {
    const state = createV2SessionState({ sessionId: "sa-boundary", participants: anchorTable(1, 3) });
    expect(Object.keys(state.relationship).sort()).toEqual(
      Object.keys(createInitialRelationshipState()).sort(),
    );
    expect("lastTargetedPairKey" in state.relationship).toBe(false);
    expect("lastTargetedPairKey" in state.orchestration).toBe(true);
    expect(state.orchestration.lastTargetedPairKey).toBeNull();
    // 出卡后也不写回 RelationshipState（只有编排态记展示事实）
    const out = asCard(drawV2SessionCard(state, fixtureRouter(), { intensityLimit: 5 }));
    expect(Object.keys(out.state.relationship).sort()).toEqual(
      Object.keys(createInitialRelationshipState()).sort(),
    );
    expect(out.state.orchestration.lastTargetedPairKey).toBe("f1::m1");
  });
});
