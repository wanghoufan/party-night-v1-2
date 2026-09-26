import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_BOUNDARIES } from "@/lib/domain/constants";
import type { GameCard, GameSession, Player, SessionConfig } from "@/lib/domain/schemas";
import { completeRound, createSession, startRound } from "@/lib/engine/session-engine";
import { applyPlayerRosterChange, cardEventFamilyForPack, reduceResolvedRound } from "@/lib/engine/v2-deal";
import { mutualCheckTrigger } from "@/lib/v2-relationship/v2-mutual-check";
import {
  applyPlayerExit,
  applyPlayerTemporarilyAway,
  countActiveMatches,
  mayCreateMatch,
  mutualDueGates,
  reduceRelationshipEvent,
} from "@/lib/v2-relationship/v2-reducer";
import {
  diffPlayerRoster,
  eligiblePairKeys,
  pairModeFor,
} from "@/lib/v2-relationship/v2-participants";
import { advanceGuarantee } from "@/lib/v2-relationship/v2-guarantee";
import { createV2SessionState, reduceV2SessionEvents } from "@/lib/v2-relationship/v2-session";
import {
  createInitialRelationshipState,
  HEAT_THRESHOLDS,
  heatForEffectiveCount,
  MAX_REGULAR_MUTUAL_RUNS,
  MAX_SESSION_COMPLETED_ROUNDS,
  MUTUAL_CHECK_COUNTS,
  RELATIONSHIP_EFFECTIVE_CARD_EVENT_TYPES,
  SESSION_COMPLETED_ROUND_EVENT_TYPES,
  type MatchState,
  type PairFiveGuarantee,
  type PairState,
  type RelationshipEventType,
  type RelationshipState,
  type SessionParticipant,
} from "@/lib/v2-relationship/v2-state";

/* ------------------------------------------------------------------ */
/* 装置                                                                  */
/* ------------------------------------------------------------------ */

const players = (count = 3): Player[] =>
  ["a", "b", "c"].slice(0, count).map((id) => ({ id, displayName: `玩家${id}`, active: true, createdAt: "x", lastUsedAt: "x" }));

const config = (overrides: Partial<SessionConfig> = {}): SessionConfig => ({
  players: players(),
  relationship: "friends",
  vibes: ["funny"],
  intensity: 3,
  boundaries: DEFAULT_BOUNDARIES,
  enabledPackIds: ["truth-dare"],
  mode: "single",
  ...overrides,
});

const card = (id: string, packId: string): GameCard => ({
  id,
  packId,
  type: packId === "expansion" ? "expansion" : "truth",
  content: `题 ${id}`,
  intensity: 1,
  tags: [],
  boundaryTags: [],
  minPlayers: 2,
  participantMode: "all",
  source: "builtin",
});

const male = (playerId: string): SessionParticipant => ({ playerId, active: true, pairGender: "male" });
const female = (playerId: string): SessionParticipant => ({ playerId, active: true, pairGender: "female" });
const genders = (): SessionParticipant[] => [male("a"), female("b"), { playerId: "c", active: true, pairGender: null }];

/** 出一轮（真牌堆 → 真 currentRound），默认单点名单轮（participantIds 恰 1 人）。 */
function dealOne(options: { packId?: string; participantIds?: string[] } = {}): GameSession {
  const packId = options.packId ?? "truth-dare";
  const deck = [card(`c-${packId}`, packId)];
  return startRound(
    createSession(config({ enabledPackIds: [packId] }), deck, genders()),
    () => 0,
    { participantIds: options.participantIds ?? ["a"] },
  );
}

/** 直接归约 n 条 REL_CARD_COMPLETED，返回关系态（用于 Heat / 结算边界断言）。 */
function reduceCompleted(n: number, base: RelationshipState = createInitialRelationshipState()): RelationshipState {
  const state = createV2SessionState({ sessionId: "h", participants: [male("a"), female("b")] });
  const events = Array.from({ length: n }, (_, index) => ({
    eventId: `e${index}`,
    type: "REL_CARD_COMPLETED" as RelationshipEventType,
    ref: `i${index}`,
    cardId: `card-${index}`,
  }));
  const reduced = reduceV2SessionEvents({ ...state, relationship: base }, events).state;
  return reduced.relationship;
}

const pairStateOf = (key: string): PairState => ({
  pairKey: key,
  sharedEvidence: 1,
  compatibilityEvidence: 0,
  crowdEvidence: 0,
  personalEvidence: 0,
  matched: true,
  matchedAt: "2026-09-25T00:00:00.000Z",
  cooldownRounds: 2,
});

const matchOf = (key: string, ids: [string, string]): MatchState => ({
  pairKey: key,
  matchedAt: "2026-09-25T00:00:00.000Z",
  playerIds: ids,
});

const pendingGuarantee = (key: string): PairFiveGuarantee => ({
  pairKey: key,
  tracker: {
    status: "pending",
    qualifyingOpportunitiesSeen: 1,
    qualifyingOpportunitiesLimit: 2,
    createdAtEffectiveCount: 4,
  },
});

/** D5 名额满载快照：a 已有 2 个 MATCH（a::b / a::c），b 另有 b::d。 */
const saturated = (): RelationshipState => ({
  ...createInitialRelationshipState(),
  heat: "H3",
  relationshipEffectiveCardCount: 11,
  sessionCompletedRounds: 11,
  pairState: { "a::b": pairStateOf("a::b"), "a::c": pairStateOf("a::c"), "b::d": pairStateOf("b::d") },
  matches: { "a::b": matchOf("a::b", ["a", "b"]), "a::c": matchOf("a::c", ["a", "c"]), "b::d": matchOf("b::d", ["b", "d"]) },
  cooldowns: { "a::b": 3, "a::c": 2, "b::d": 1 },
  fiveGuarantees: { "a::b": pendingGuarantee("a::b"), "b::d": pendingGuarantee("b::d") },
});

const relAt = (count: number, overrides: Partial<RelationshipState> = {}): RelationshipState => ({
  ...createInitialRelationshipState(),
  heat: heatForEffectiveCount(count),
  relationshipEffectiveCardCount: count,
  sessionCompletedRounds: count,
  ...overrides,
});

/** 4 人名册 a/b/c/d（全在场）：对上 saturated() 的 a::b / a::c / b::d 三边。 */
const rosterPlayers = (): Player[] =>
  ["a", "b", "c", "d"].map((id) => ({ id, displayName: `玩家${id}`, active: true, createdAt: "x", lastUsedAt: "x" }));

/** 真 Session（4 人真名册 + 真参与者投影），关系态换成 saturated() 快照用于迁移断言。 */
function rosterSession(): GameSession {
  const deck = [card("c-roster", "truth-dare")];
  const session = startRound(
    createSession(config({ players: rosterPlayers() }), deck, [male("a"), female("b"), male("c"), female("d")]),
    () => 0,
    { participantIds: ["a"] },
  );
  return { ...session, relationshipState: saturated() };
}

/* ------------------------------------------------------------------ */
/* 1. 发牌完成路径：REL completed 唯一计数                                 */
/* ------------------------------------------------------------------ */

describe("V2-B10 R3 事件归约（发牌完成路径）", () => {
  it("REL_CARD_COMPLETED：推进 relationshipEffectiveCardCount 与 used，currentRound 保留给引擎", () => {
    const session = dealOne({ participantIds: ["a"] });
    expect(session.currentRound).toBeDefined();
    expect(session.relationshipState?.relationshipEffectiveCardCount).toBe(0);

    const round = session.currentRound!;
    const reduced = reduceResolvedRound(session, "completed", "2026-09-25T00:00:00.000Z");

    expect(reduced.relationshipState?.relationshipEffectiveCardCount).toBe(1);
    expect(reduced.relationshipState?.sessionCompletedRounds).toBe(1);
    expect(reduced.relationshipState?.heat).toBe("H1");
    expect(reduced.relationshipState?.terminalExclusivity[round.id]).toBe("completed");
    // 出牌时已记 used，归约不重复记（同一 cardId 只一条）
    expect(reduced.usedCardIds).toEqual([...new Set(reduced.usedCardIds)]);
    expect(reduced.usedCardIds).toEqual(session.usedCardIds);
    // currentRound 原样保留，供 completeRound/startRound 继续
    expect(reduced.currentRound?.id).toBe(round.id);
    expect(reduced.deckSnapshot).toEqual(session.deckSnapshot);
  });

  it("skip / swap 不计：不推进有效卡计数、不消耗 20/25 限额、不推 Heat", () => {
    for (const terminal of ["skipped", "swapped"] as const) {
      const session = dealOne();
      const round = session.currentRound!;
      const reduced = reduceResolvedRound(session, terminal);

      expect(reduced.relationshipState?.relationshipEffectiveCardCount).toBe(0);
      expect(reduced.relationshipState?.sessionCompletedRounds).toBe(0);
      expect(reduced.relationshipState?.heat).toBe("H1");
      expect(reduced.relationshipState?.terminalExclusivity[round.id]).toBe(terminal);
    }
  });

  it("双计数器按 D3：neutral / expansion completed 推进 sessionCompletedRounds，但不推 effective、不推 Heat", () => {
    for (const packId of ["table-tools", "expansion"]) {
      const session = dealOne({ packId });
      const reduced = reduceResolvedRound(session, "completed");

      expect(reduced.relationshipState?.sessionCompletedRounds).toBe(1);
      expect(reduced.relationshipState?.relationshipEffectiveCardCount).toBe(0);
      expect(reduced.relationshipState?.heat).toBe("H1");
    }
  });

  it("事件族单一口径：关系主线玩法=REL、expansion=EXPANSION、其余=NEUTRAL", () => {
    expect(cardEventFamilyForPack("truth-dare")).toBe("REL");
    expect(cardEventFamilyForPack("pointing-game")).toBe("REL");
    expect(cardEventFamilyForPack("expansion")).toBe("EXPANSION");
    expect(cardEventFamilyForPack("spin-bottle")).toBe("NEUTRAL");
    expect(cardEventFamilyForPack("table-tools")).toBe("NEUTRAL");
  });

  it("连续有效回合端到端：4 轮 completed → 计数 4 / Heat H2 / 两个计数器同值", () => {
    let session: GameSession = createSession(
      config(),
      [1, 2, 3, 4, 5].map((n) => card(`t-${n}`, "truth-dare")),
      genders(),
    );
    for (let index = 0; index < 4; index += 1) {
      session = startRound(session, () => 0);
      expect(session.currentRound).toBeDefined();
      session = reduceResolvedRound(session, "completed");
      session = completeRound(session);
    }

    expect(session.relationshipState?.relationshipEffectiveCardCount).toBe(4);
    expect(session.relationshipState?.sessionCompletedRounds).toBe(4);
    expect(session.relationshipState?.heat).toBe("H2");
    expect(session.rounds.filter((round) => round.status === "completed")).toHaveLength(4);
  });

  it("归约已接入 /game 发牌完成路径（resolve 先归约再走引擎）", () => {
    const page = readFileSync(join(process.cwd(), "app/game/page.tsx"), "utf8");
    expect(page).toMatch(/reduceResolvedRound\(session, /);
    expect(page).toMatch(/const reduced = reduceResolvedRound/);
  });

  /* ---------------------------------------------------------------- */
  /* 2. Heat 绝对阈值（D3：0–3 / 4–7 / 8–12 / 13+）                       */
  /* ---------------------------------------------------------------- */

  it("Heat 档位锁死：H1≤3、4–7=H2、8–12=H3、13+=H4，且与冻结表同源", () => {
    expect(reduceCompleted(0).heat).toBe("H1");
    expect(reduceCompleted(3).heat).toBe("H1");
    expect(reduceCompleted(4).heat).toBe("H2");
    expect(reduceCompleted(7).heat).toBe("H2");
    expect(reduceCompleted(8).heat).toBe("H3");
    expect(reduceCompleted(12).heat).toBe("H3");
    expect(reduceCompleted(13).heat).toBe("H4");
    expect(reduceCompleted(MAX_SESSION_COMPLETED_ROUNDS).heat).toBe("H4");

    expect(
      HEAT_THRESHOLDS.map((band) => [band.heat, band.min, band.max === Infinity ? null : band.max]),
    ).toEqual([
      ["H1", 0, 3],
      ["H2", 4, 7],
      ["H3", 8, 12],
      ["H4", 13, null],
    ]);
  });

  /* ---------------------------------------------------------------- */
  /* 3. mutual 9/14/19 可达 + 单一口径                                    */
  /* ---------------------------------------------------------------- */

  it("mutual 检查点 9/14/19 可达，且触发判定与 mutualDueGates 同源同结果", () => {
    const at9 = relAt(9);
    const at14 = relAt(14, { lastMutualCheckAtEffectiveCount: 9, regularMutualCheckRuns: 1 });
    const at19 = relAt(19, {
      extensionActivated: true,
      lastMutualCheckAtEffectiveCount: 14,
      regularMutualCheckRuns: 2,
    });
    const blocked = relAt(9, { regularMutualCheckRuns: MAX_REGULAR_MUTUAL_RUNS });

    for (const [state, checkpoint] of [
      [at9, 9],
      [at14, 14],
      [at19, 19],
    ] as const) {
      expect(mutualDueGates(state, checkpoint)).toBe(true);
      const trigger = mutualCheckTrigger({
        relationship: state,
        participants: [male("a"), female("b")],
        sessionStatus: "active",
      });
      expect(trigger.checkpoint).toBe(checkpoint);
      expect(trigger.due).toBe(true);
      expect(trigger.due).toBe(mutualDueGates(state, checkpoint));
    }

    // 整局次数用尽 → 同一检查点不再弹，触发判定与 reducer 门结果一致
    expect(mutualDueGates(blocked, 9)).toBe(false);
    const blockedTrigger = mutualCheckTrigger({
      relationship: blocked,
      participants: [male("a"), female("b")],
      sessionStatus: "active",
    });
    expect(blockedTrigger.due).toBe(false);
    expect(blockedTrigger.reason).toBe("gates-not-passed");
  });

  it("第三次 regular mutual 与 Session 结算边界不断：19 需已加玩；21–25 无第四个检查点", () => {
    // 未加玩：19 时只剩 1 轮，不给新 MATCH 保障窗口 → 19 常规不触发
    const noExtension = relAt(19);
    expect(mutualDueGates(noExtension, 19)).toBe(false);
    // 已加玩：目标 25，剩余 6 轮 → 19 触发（第三次 regular）
    const extended = relAt(19, {
      extensionActivated: true,
      lastMutualCheckAtEffectiveCount: 14,
      regularMutualCheckRuns: 2,
    });
    expect(mutualDueGates(extended, 19)).toBe(true);

    // 未加玩的 20 上限：第 21 个 completed 被拒，计数不涨
    const at20 = relAt(20);
    const overflow = reduceRelationshipEvent(at20, {
      eventId: "x",
      type: "REL_CARD_COMPLETED",
      ref: "r",
      cardId: "c",
    });
    expect(overflow.delta.reasons).toContain("session_limit_reached");
    expect(overflow.state.relationshipEffectiveCardCount).toBe(20);

    // 加玩后的 25 上限：仍保持 H4，且不再接受新 completed
    const at25 = relAt(MAX_SESSION_COMPLETED_ROUNDS, { extensionActivated: true });
    const overflow25 = reduceRelationshipEvent(at25, {
      eventId: "y",
      type: "REL_CARD_COMPLETED",
      ref: "r2",
      cardId: "c2",
    });
    expect(overflow25.delta.reasons).toContain("session_limit_reached");
    expect(overflow25.state.heat).toBe("H4");

    // 21 不是常规检查点：即使已加玩也不标记 due（无第四次 regular mutual）
    expect(MUTUAL_CHECK_COUNTS).toEqual([9, 14, 19]);
    const due21 = reduceRelationshipEvent(extended, {
      eventId: "d21",
      type: "SYSTEM_MUTUAL_CHECK_DUE",
      dueCount: 21,
    });
    expect(due21.delta.reasons).not.toContain("mutual_due");
    expect(due21.state.regularMutualCheckRuns).toBe(2);
  });

  it("final mutual 是独立系统事件：与 19 常规 due 不合并、不去重，且不补计数", () => {
    const state = relAt(19, {
      extensionActivated: true,
      lastMutualCheckAtEffectiveCount: 14,
      regularMutualCheckRuns: 2,
    });
    const due = reduceRelationshipEvent(state, {
      eventId: "run::due",
      type: "SYSTEM_MUTUAL_CHECK_DUE",
      dueCount: 19,
    });
    expect(due.delta.reasons).toContain("mutual_due");
    expect(due.state.regularMutualCheckRuns).toBe(3);

    const final = reduceRelationshipEvent(due.state, {
      eventId: "run::final",
      type: "SYSTEM_MUTUAL_CHECK_FINAL",
      pairKey: "a::b",
      playerIds: ["a", "b"],
      consented: true,
      timestamp: "2026-09-25T00:00:00.000Z",
    });
    expect(final.delta.applied).toBe(true);
    expect(final.delta.replayed).toBe(false);
    expect(final.state.matches["a::b"]).toBeDefined();
    expect(final.state.relationshipEffectiveCardCount).toBe(19);
    expect(final.state.heat).toBe("H4");
  });

  /* ---------------------------------------------------------------- */
  /* 4. system / consent 不计 + 幂等 + 终态互斥                           */
  /* ---------------------------------------------------------------- */

  it("system / consent 事件全不计：不改计数、Heat、used，也不重复触发 mutual", () => {
    const types: RelationshipEventType[] = [
      "SYSTEM_MUTUAL_CHECK_START",
      "SYSTEM_MUTUAL_CHECK_SUBMIT",
      "SYSTEM_MUTUAL_CHECK_CANCEL",
      "CONSENT_REQUEST",
      "CONSENT_SUBMIT",
      "CONSENT_INTERSECTION",
      "CONSENT_NO_ACTION",
      "EVENT_REPLAYED_OR_DUPLICATE",
    ];
    let state = relAt(9);

    types.forEach((type, index) => {
      const out = reduceRelationshipEvent(state, { eventId: `s${index}`, type, ref: `si${index}` });
      expect(out.state.relationshipEffectiveCardCount).toBe(9);
      expect(out.state.sessionCompletedRounds).toBe(9);
      expect(out.state.heat).toBe("H3");
      expect(out.state.usedCardIds).toEqual([]);
      state = out.state;
    });

    expect(state.regularMutualCheckRuns).toBe(0);
    expect(state.lastMutualCheckAtEffectiveCount).toBeNull();
  });

  it("唯一计数事件类型锁定：只认 REL_CARD_COMPLETED 推有效计数，completed 类才消耗轮次", () => {
    expect(RELATIONSHIP_EFFECTIVE_CARD_EVENT_TYPES).toEqual(["REL_CARD_COMPLETED"]);
    expect(SESSION_COMPLETED_ROUND_EVENT_TYPES).toEqual([
      "REL_CARD_COMPLETED",
      "NEUTRAL_CARD_COMPLETED",
      "EXPANSION_CARD_COMPLETED",
      "LEGACY_CURRENT_COMPLETED",
    ]);
  });

  it("幂等与终态互斥：同轮 completed 只计一次；completed 后的 skip/swap 是重复事件", () => {
    const session = dealOne();
    const round = session.currentRound!;

    const first = reduceResolvedRound(session, "completed");
    expect(first.relationshipState?.relationshipEffectiveCardCount).toBe(1);

    const replay = reduceResolvedRound(first, "completed");
    expect(replay.relationshipState?.relationshipEffectiveCardCount).toBe(1);
    expect(replay.usedCardIds).toEqual(first.usedCardIds);

    const conflict = reduceResolvedRound(first, "skipped");
    expect(conflict.relationshipState?.relationshipEffectiveCardCount).toBe(1);
    expect(conflict.relationshipState?.sessionCompletedRounds).toBe(1);
    expect(conflict.relationshipState?.terminalExclusivity[round.id]).toBe("completed");
  });

  /* ---------------------------------------------------------------- */
  /* 5. R4 退出 / 暂离                                                   */
  /* ---------------------------------------------------------------- */

  it("R4 退出：删含该玩家的边与 MATCH（释放 D5 名额），其余边原样保留，保障进 expired", () => {
    const before = saturated();
    const after = applyPlayerExit(before, "a");

    expect(countActiveMatches(before.matches, "a")).toBe(2);
    expect(countActiveMatches(after.matches, "a")).toBe(0);
    expect(mayCreateMatch(after.matches, ["a", "d"], "a::d")).toBe(true);

    expect(Object.keys(after.pairState)).toEqual(["b::d"]);
    expect(Object.keys(after.cooldowns)).toEqual(["b::d"]);
    expect(Object.keys(after.matches)).toEqual(["b::d"]);

    const exited = after.fiveGuarantees["a::b"]?.tracker;
    expect(exited?.status).toBe("expired");
    expect(exited?.terminalReason).toBe("expired-player-exit");
    expect(after.fiveGuarantees["b::d"]?.tracker?.status).toBe("pending");

    // 退出本身不计有效卡、不推 Heat / 轮次
    expect(after.relationshipEffectiveCardCount).toBe(11);
    expect(after.sessionCompletedRounds).toBe(11);
    expect(after.heat).toBe("H3");
  });

  it("R4 暂离：只暂停保障，signal/MATCH/cooldown 全保留，D5 名额不释放", () => {
    const before = saturated();
    const after = applyPlayerTemporarilyAway(before, "a");

    expect(countActiveMatches(after.matches, "a")).toBe(2);
    expect(mayCreateMatch(after.matches, ["a", "d"], "a::d")).toBe(false);

    expect(Object.keys(after.pairState).sort()).toEqual(["a::b", "a::c", "b::d"]);
    expect(Object.keys(after.cooldowns).sort()).toEqual(["a::b", "a::c", "b::d"]);
    expect(Object.keys(after.matches).sort()).toEqual(["a::b", "a::c", "b::d"]);

    const paused = after.fiveGuarantees["a::b"]?.tracker;
    expect(paused?.status).toBe("paused");
    expect(paused?.pauseReason).toBe("player-away");
    expect(paused?.qualifyingOpportunitiesSeen).toBe(1);
    expect(after.fiveGuarantees["b::d"]?.tracker?.status).toBe("pending");

    expect(after.relationshipEffectiveCardCount).toBe(11);
    expect(after.sessionCompletedRounds).toBe(11);
  });

  it("单一口径：v2-mutual-check 复用 reducer 的 mutualDueGates，不另写四道门", () => {
    const source = readFileSync(join(process.cwd(), "lib/v2-relationship/v2-mutual-check.ts"), "utf8");
    expect(source).toMatch(/from\s+["']\.\/v2-reducer["']/);
    expect(source).toMatch(/mutualDueGates/);
    // 不自己重写剩余轮次 / 整局次数 / 最小间隔三条门
    expect(source).not.toMatch(/MINIMUM_REMAINING_SESSION_ROUNDS_FOR_REGULAR_MUTUAL/);
    expect(source).not.toMatch(/MAX_REGULAR_MUTUAL_RUNS/);
    expect(source).not.toMatch(/MINIMUM_EFFECTIVE_CARDS_BETWEEN_RUNS/);
  });
});

/* ------------------------------------------------------------------ */
/* 6. 生产接线：名册变更（EXIT 终止 / AWAY 暂停 / RETURN 回席）              */
/* ------------------------------------------------------------------ */

describe("V2-B10 生产接线：applyPlayerRosterChange（禁把 active=false 一刀切）", () => {
  it("名册差三分语义：移出名册＝EXIT、在场转暂离＝AWAY、暂离转回席＝RETURN；改名与新增不迁移", () => {
    const before = rosterPlayers();
    const after = [
      { ...before[0]!, displayName: "改了个名" },
      { ...before[1]!, active: false },
      before[3]!,
      { id: "e", displayName: "玩家e", active: true, createdAt: "x", lastUsedAt: "x" },
    ];
    expect(diffPlayerRoster(before, after)).toEqual({ exited: ["c"], away: ["b"], returned: [] });

    expect(diffPlayerRoster(before, rosterPlayers())).toEqual({ exited: [], away: [], returned: [] });
    const away = rosterPlayers().map((player) => (player.id === "b" ? { ...player, active: false } : player));
    expect(diffPlayerRoster(away, rosterPlayers())).toEqual({ exited: [], away: [], returned: ["b"] });
  });

  it("EXIT：删含该玩家的 MATCH/signal/cooldown、保障 expired、D5 名额释放；无关 pair 与计数不受影响", () => {
    const session = rosterSession();
    const after = applyPlayerRosterChange(session, rosterPlayers().filter((player) => player.id !== "a"));
    const state = after.relationshipState!;

    expect(Object.keys(state.matches)).toEqual(["b::d"]);
    expect(Object.keys(state.pairState)).toEqual(["b::d"]);
    expect(Object.keys(state.cooldowns)).toEqual(["b::d"]);

    expect(countActiveMatches(state.matches, "a")).toBe(0);
    expect(mayCreateMatch(state.matches, ["a", "d"], "a::d")).toBe(true);
    expect(state.fiveGuarantees["a::b"]?.tracker?.status).toBe("expired");
    expect(state.fiveGuarantees["a::b"]?.tracker?.terminalReason).toBe("expired-player-exit");

    // D5 名额释放对剩余玩家同样生效：b 原本 2 个 MATCH（a::b / b::d）满载、b::c 被拦；
    // a 退出删掉 a::b 后 b 降到 1 → b::c 可再建（名额是真释放，不只是该玩家自己变 0）。
    expect(mayCreateMatch(saturated().matches, ["b", "c"], "b::c")).toBe(false);
    expect(mayCreateMatch(state.matches, ["b", "c"], "b::c")).toBe(true);
    expect(countActiveMatches(state.matches, "b")).toBe(1);
    expect(countActiveMatches(state.matches, "c")).toBe(0);

    // 无关 pair 原样保留（MATCH 与 cooldown 一模一样）
    expect(state.matches["b::d"]).toEqual(saturated().matches["b::d"]);
    expect(state.cooldowns["b::d"]).toBe(1);
    expect(state.fiveGuarantees["b::d"]?.tracker?.status).toBe("pending");

    // 退出不计有效卡、不推进 Heat/轮次，used 账也不动
    expect(state.relationshipEffectiveCardCount).toBe(11);
    expect(state.sessionCompletedRounds).toBe(11);
    expect(after.usedCardIds).toEqual(session.usedCardIds);

    // 参与者投影：离开者随名册消失而退出 pair pool
    expect(after.config.players.map((player) => player.id)).toEqual(["b", "c", "d"]);
    expect(after.participants?.map((participant) => participant.playerId)).toEqual(["b", "c", "d"]);
  });

  it("AWAY：MATCH/signal/cooldown 全保留、D5 名额不释放、保障 paused；无关 pair 与计数不受影响", () => {
    const session = rosterSession();
    const after = applyPlayerRosterChange(
      session,
      rosterPlayers().map((player) => (player.id === "a" ? { ...player, active: false } : player)),
    );
    const state = after.relationshipState!;

    expect(Object.keys(state.matches).sort()).toEqual(["a::b", "a::c", "b::d"]);
    expect(Object.keys(state.pairState).sort()).toEqual(["a::b", "a::c", "b::d"]);
    expect(Object.keys(state.cooldowns).sort()).toEqual(["a::b", "a::c", "b::d"]);

    expect(countActiveMatches(state.matches, "a")).toBe(2);
    expect(mayCreateMatch(state.matches, ["a", "d"], "a::d")).toBe(false);

    const paused = state.fiveGuarantees["a::b"]?.tracker;
    expect(paused?.status).toBe("paused");
    expect(paused?.pauseReason).toBe("player-away");
    expect(paused?.qualifyingOpportunitiesSeen).toBe(1);
    expect(state.fiveGuarantees["b::d"]?.tracker?.status).toBe("pending");

    expect(state.relationshipEffectiveCardCount).toBe(11);
    expect(state.sessionCompletedRounds).toBe(11);
    expect(after.usedCardIds).toEqual(session.usedCardIds);

    // 参与者投影：仍在名册但 active=false → 立即排除出可调度 pair pool（边本身保留待恢复）
    expect(after.participants?.find((participant) => participant.playerId === "a")?.active).toBe(false);
    expect(eligiblePairKeys(after.participants!)).not.toContain("a::b");
    expect(pairModeFor(after.participants!)).toBe("ACTIVE");
  });

  it("RETURN：不删边、不 expired，保障从暂停点继续（恢复 pending、计数不清零）且旧边重回合法 pool", () => {
    const session = rosterSession();
    const away = applyPlayerRosterChange(
      session,
      rosterPlayers().map((player) => (player.id === "a" ? { ...player, active: false } : player)),
    );
    const back = applyPlayerRosterChange(away, rosterPlayers());
    const state = back.relationshipState!;

    const tracker = state.fiveGuarantees["a::b"]?.tracker;
    expect(tracker?.status).toBe("paused");
    expect(tracker?.qualifyingOpportunitiesSeen).toBe(1);
    expect(Object.keys(state.matches).sort()).toEqual(["a::b", "a::c", "b::d"]);

    // 从暂停点继续：paused → pending，已累计的合格机会计数不清零、不补算离席期机会
    const resumed = advanceGuarantee(state.fiveGuarantees["a::b"] ?? null, { kind: "resume" });
    expect(resumed.tracker?.status).toBe("pending");
    expect(resumed.tracker?.qualifyingOpportunitiesSeen).toBe(1);

    // 回席后参与者重新 in-active，旧边重回合法 pool
    expect(back.participants?.find((participant) => participant.playerId === "a")?.active).toBe(true);
    expect(eligiblePairKeys(back.participants!)).toContain("a::b");
  });
});
