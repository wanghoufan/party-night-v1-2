import {
  createEmptyPlayerCoverage,
  heatForEffectiveCount,
  BASE_SESSION_COMPLETED_ROUND_LIMIT,
  DEFAULT_COVERAGE_LOW_PARTICIPATION_SKIP_THRESHOLD,
  MAX_ACTIVE_MATCHES_PER_PLAYER,
  MAX_REGULAR_MUTUAL_RUNS,
  MAX_SESSION_COMPLETED_ROUNDS,
  MINIMUM_EFFECTIVE_CARDS_BETWEEN_RUNS,
  MINIMUM_REMAINING_SESSION_ROUNDS_FOR_REGULAR_MUTUAL,
  MUTUAL_CHECK_COUNTS,
  SESSION_COMPLETED_ROUND_EVENT_TYPES,
  RELATIONSHIP_EFFECTIVE_CARD_EVENT_TYPES,
  type Heat,
  type PairFiveGuarantee,
  type RelationshipEventType,
  type RelationshipState,
  type TerminalInteractionState,
} from "./v2-state";

/* ------------------------------------------------------------------ */
/* 事件体外壳（R3；engine 落盘前经 zod 校验，此处假设已合规）                 */
/* ------------------------------------------------------------------ */

export interface RelationshipEvent {
  eventId: string;
  type: RelationshipEventType;
  /** interactionId：终态互斥键。计数/跳过/交换类事件必须携带。 */
  ref?: string;
  /** REL_CARD_COMPLETED 消耗的卡 id。 */
  cardId?: string;
  /** 定向覆盖归属玩家（REL_CARD completed/skipped/swapped 用）。 */
  playerId?: string;
  /** mutual check 目标 pair。 */
  pairKey?: string;
  /** mutual check 当事人双方。 */
  playerIds?: readonly [string, string];
  /** match 成型是否需要双方同意（COMPLETE/FINAL 用）。 */
  consented?: boolean;
  /** SYSTEM_MUTUAL_CHECK_DUE 显式目标计数。 */
  dueCount?: number;
  /** NEUTRAL/EXPANSION 组合事件的明确终态。 */
  terminal?: TerminalInteractionState;
  timestamp?: string;
}

/* ------------------------------------------------------------------ */
/* delta                                                               */
/* ------------------------------------------------------------------ */

export type ReduceDeltaReason =
  | "session_completed"
  | "relationship_effective_advanced"
  | "extension_activated"
  | "heat_changed"
  | "terminal_recorded"
  | "mutual_due"
  | "match_created"
  | "cooldown_set"
  | "cooldown_ticked"
  | "session_limit_reached"
  | "terminal_conflict"
  | "replay_ignored";

export interface ReduceDelta {
  applied: boolean;
  replayed: boolean;
  reasons: ReduceDeltaReason[];
  fromEffectiveCount: number;
  toEffectiveCount: number;
  fromHeat: Heat;
  toHeat: Heat;
}

/* ------------------------------------------------------------------ */
/* 内部工具                                                              */
/* ------------------------------------------------------------------ */

function terminalOf(ev: RelationshipEvent): TerminalInteractionState | null {
  switch (ev.type) {
    case "REL_CARD_COMPLETED":
    case "NEUTRAL_CARD_COMPLETED":
    case "EXPANSION_CARD_COMPLETED":
    case "LEGACY_CURRENT_COMPLETED":
      return "completed";
    case "REL_CARD_SKIPPED":
    case "LEGACY_CURRENT_SKIPPED":
      return "skipped";
    case "REL_CARD_SWAPPED":
      return "swapped";
    case "NEUTRAL_CARD_SKIPPED_OR_SWAPPED":
    case "EXPANSION_CARD_SKIPPED_OR_SWAPPED":
      return ev.terminal ?? null;
    default:
      return null;
  }
}

const isCompletedType = (t: RelationshipEventType): boolean =>
  SESSION_COMPLETED_ROUND_EVENT_TYPES.includes(t);

const isEffectiveAdvancingType = (t: RelationshipEventType): boolean =>
  RELATIONSHIP_EFFECTIVE_CARD_EVENT_TYPES.includes(t);

/** D5：统计某玩家当前 active MATCH 数（matches 无撤销建模，存量即 active）。 */
export function countActiveMatches(
  matches: RelationshipState["matches"],
  playerId: string,
): number {
  let count = 0;
  for (const match of Object.values(matches)) {
    if (match.playerIds[0] === playerId || match.playerIds[1] === playerId) {
      count += 1;
    }
  }
  return count;
}

/** D5：新建 MATCH 前的原子 cap 校验（已达上限的双方任一超限都不建；已存在的 pair 不重复建）。 */
export function mayCreateMatch(
  matches: RelationshipState["matches"],
  playerIds: readonly [string, string],
  pairKey: string,
): boolean {
  if (matches[pairKey] !== undefined) return true;
  return (
    countActiveMatches(matches, playerIds[0]) < MAX_ACTIVE_MATCHES_PER_PLAYER &&
    countActiveMatches(matches, playerIds[1]) < MAX_ACTIVE_MATCHES_PER_PLAYER
  );
}

/* ------------------------------------------------------------------ */
/* R4 §4.3 / §4.4：玩家退出（终止）与暂离（暂停）                          */
/* ------------------------------------------------------------------ */

/** pairKey（`a::b`，升序）是否含该玩家。 */
const pairHasPlayer = (key: string, playerId: string): boolean => key.split("::").includes(playerId);

/** 移除所有含该玩家的边键（pairKey 即边 id；不含该玩家的边原样保留）。 */
function withoutPlayerEdges<T>(record: Record<string, T>, playerId: string): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!pairHasPlayer(key, playerId)) next[key] = value;
  }
  return next;
}

/** 保障进终态 expired（offered/expired 已是终态，不回写、不降级）。 */
function expireGuarantee(guarantee: PairFiveGuarantee, terminalReason: string): PairFiveGuarantee {
  const tracker = guarantee.tracker;
  if (tracker === null || tracker.status === "offered" || tracker.status === "expired") return guarantee;
  return { ...guarantee, tracker: { ...tracker, status: "expired", terminalReason } };
}

/** 保障暂停（只暂停 pending；已 paused 保留原计数，已是终态不动）。 */
function pauseGuarantee(guarantee: PairFiveGuarantee, pauseReason: string): PairFiveGuarantee {
  const tracker = guarantee.tracker;
  if (tracker === null || tracker.status !== "pending") return guarantee;
  return { ...guarantee, tracker: { ...tracker, status: "paused", pauseReason } };
}

/**
 * R4 §4.3 中途退出 `PLAYER_EXITED`：退出是终止语义。
 * 原子处理：删除所有含该 `playerId` 的边——`pairState`（signal）、`cooldowns`、`matches`（MATCH）
 * ——相关 5 档保障进终态 `expired` + `terminalReason="expired-player-exit"`。
 * 删 MATCH 即释放该玩家的 D5 名额（`countActiveMatches` 立即下降，新 MATCH 可再建）；
 * 不含该玩家的边原样保留。把该玩家设为非 active 由参与者投影负责（v2-participants），
 * 本函数只处理关系态边，不碰计数（退出不计 effective count、不推进 Heat/mutual）。
 */
export function applyPlayerExit(state: RelationshipState, playerId: string): RelationshipState {
  const fiveGuarantees: Record<string, PairFiveGuarantee> = {};
  for (const [key, guarantee] of Object.entries(state.fiveGuarantees)) {
    fiveGuarantees[key] = pairHasPlayer(key, playerId)
      ? expireGuarantee(guarantee, "expired-player-exit")
      : guarantee;
  }
  return {
    ...state,
    pairState: withoutPlayerEdges(state.pairState, playerId),
    cooldowns: withoutPlayerEdges(state.cooldowns, playerId),
    matches: withoutPlayerEdges(state.matches, playerId),
    fiveGuarantees,
  };
}

/**
 * R4 §4.4 暂离 `PLAYER_TEMPORARILY_AWAY`：暂离是暂停语义，不删任何边。
 * 含该玩家的边从可调度 pool 排除（由参与者 `active=false` 完成），signal / cooldown / MATCH
 * 全部保留 → D5 名额不释放（第三人不得顶上）；相关 5 档保障标记 `paused` +
 * `pauseReason="player-away"`，已累计的合格机会计数不清零。
 * 暂离不计 effective count、不推进 Heat/mutual，返回后从暂停点继续（不补算）。
 */
export function applyPlayerTemporarilyAway(state: RelationshipState, playerId: string): RelationshipState {
  const fiveGuarantees: Record<string, PairFiveGuarantee> = {};
  for (const [key, guarantee] of Object.entries(state.fiveGuarantees)) {
    fiveGuarantees[key] = pairHasPlayer(key, playerId)
      ? pauseGuarantee(guarantee, "player-away")
      : guarantee;
  }
  return { ...state, fiveGuarantees };
}

/**
 * R3 mutual due 四道门（唯一口径；reducer 与 mutual 触发判定共用，不得另写第二套）：
 * ①dueCount ∈ MUTUAL_CHECK_COUNTS(9/14/19)；
 * ②target - sessionCompletedRounds >= 2（target = extensionActivated ? 25 : 20）；
 * ③regularMutualCheckRuns < MAX_REGULAR_MUTUAL_RUNS(3)；
 * ④lastMutualCheckAtEffectiveCount 为 null 或 dueCount - last >= 5。
 */
export function mutualDueGates(state: RelationshipState, dueCount: number): boolean {
  const targetSessionCompletedRounds = state.extensionActivated
    ? MAX_SESSION_COMPLETED_ROUNDS
    : BASE_SESSION_COMPLETED_ROUND_LIMIT;
  const hasEligibleDueCount = (MUTUAL_CHECK_COUNTS as readonly number[]).includes(dueCount);
  const hasRemainingRounds =
    targetSessionCompletedRounds - state.sessionCompletedRounds >=
    MINIMUM_REMAINING_SESSION_ROUNDS_FOR_REGULAR_MUTUAL;
  const isUnderRunCap = state.regularMutualCheckRuns < MAX_REGULAR_MUTUAL_RUNS;
  const hasEnoughGap =
    state.lastMutualCheckAtEffectiveCount === null ||
    dueCount - state.lastMutualCheckAtEffectiveCount >= MINIMUM_EFFECTIVE_CARDS_BETWEEN_RUNS;
  return hasEligibleDueCount && hasRemainingRounds && isUnderRunCap && hasEnoughGap;
}

/* ------------------------------------------------------------------ */
/* reducer                                                             */
/* ------------------------------------------------------------------ */

/**
 * 把一条 R3 事件归约到 RelationshipState（纯函数，不动原 state）。
 * 语义：eventId 幂等 → 终态互斥 → completed 消耗轮次（上限 25）
 * → REL completed 推进 effective 计数 → Heat 重算 → 扩展激活 → mutual/MATCH。
 */
export function reduceRelationshipEvent(
  state: RelationshipState,
  event: RelationshipEvent,
): { state: RelationshipState; delta: ReduceDelta } {
  const baseDelta: ReduceDelta = {
    applied: false,
    replayed: false,
    reasons: [],
    fromEffectiveCount: state.relationshipEffectiveCardCount,
    toEffectiveCount: state.relationshipEffectiveCardCount,
    fromHeat: state.heat,
    toHeat: state.heat,
  };

  /* 1) eventId 幂等：处理过的一律丢弃 */
  if (state.processedEventIds.includes(event.eventId)) {
    return {
      state,
      delta: { ...baseDelta, replayed: true, reasons: ["replay_ignored"] },
    };
  }

  /* 2) 终态互斥：ref 已有终态 → 一律视为重复 */
  if (event.ref && state.terminalExclusivity[event.ref] !== undefined) {
    return {
      state,
      delta: { ...baseDelta, reasons: ["terminal_conflict"] },
    };
  }

  const next = { ...state };
  const reasons: ReduceDeltaReason[] = [];
  const terminal = terminalOf(event);

  /* 3) 记录 eventId（幂等集合） */
  next.processedEventIds = [...state.processedEventIds, event.eventId];

  /* 4) 记录终态互斥 */
  if (event.ref && terminal) {
    next.terminalExclusivity = { ...next.terminalExclusivity, [event.ref]: terminal };
    reasons.push("terminal_recorded");
  }

  /* 5) completed 类：消耗 Session 轮次（未加玩封顶 20，Host 加玩后 25） */
  if (terminal === "completed" && isCompletedType(event.type)) {
    const completedLimit = next.extensionActivated
      ? MAX_SESSION_COMPLETED_ROUNDS
      : BASE_SESSION_COMPLETED_ROUND_LIMIT;
    if (next.sessionCompletedRounds >= completedLimit) {
      return {
        state,
        delta: { ...baseDelta, reasons: [...reasons, "session_limit_reached"] },
      };
    }
    next.sessionCompletedRounds = next.sessionCompletedRounds + 1;
    reasons.push("session_completed");
  }

  /* 6) REL completed：推进 relationshipEffectiveCardCount（唯一来源）＋记 usedCardIds */
  if (isEffectiveAdvancingType(event.type) && terminal === "completed") {
    const before = next.relationshipEffectiveCardCount;
    next.relationshipEffectiveCardCount = before + 1;
    reasons.push("relationship_effective_advanced");
    if (event.cardId) next.usedCardIds = [...next.usedCardIds, event.cardId];
  }

  /* 6b) skip/swap 的 cardId 也进 used，防止立即重现 */
  if (
    (event.type === "REL_CARD_SKIPPED" || event.type === "REL_CARD_SWAPPED") &&
    event.cardId
  ) {
    next.usedCardIds = [...next.usedCardIds, event.cardId];
  }

  /* 6c) Coverage：仅 REL 定向 completed/skipped 记 offered（R3 冻结表口径）；
       swapped 只写 usedCardIds，不动 coverage（offered/completed 均 +0）。
       completed：completed+1、连续跳过清零、低参与解除；
       skipped：连续跳过+1，达阈值（2）标低参与。 */
  if (
    event.playerId &&
    (event.type === "REL_CARD_COMPLETED" || event.type === "REL_CARD_SKIPPED")
  ) {
    const prev = next.playerCoverage[event.playerId] ?? createEmptyPlayerCoverage();
    const coverage = { ...prev, offeredTargeted: prev.offeredTargeted + 1 };
    if (event.type === "REL_CARD_COMPLETED") {
      coverage.completedTargeted = prev.completedTargeted + 1;
      coverage.consecutiveTargetedSkips = 0;
      coverage.lowParticipation = false;
    } else if (event.type === "REL_CARD_SKIPPED") {
      const skips = prev.consecutiveTargetedSkips + 1;
      coverage.consecutiveTargetedSkips = skips;
      coverage.lowParticipation = skips >= DEFAULT_COVERAGE_LOW_PARTICIPATION_SKIP_THRESHOLD;
    }
    next.playerCoverage = { ...next.playerCoverage, [event.playerId]: coverage };
  }

  /* 7) Heat 重算（只看 relationshipEffectiveCardCount） */
  next.heat = heatForEffectiveCount(next.relationshipEffectiveCardCount);
  if (next.heat !== state.heat) reasons.push("heat_changed");

  /* 7b) 仅 effective 推进型（REL）completed 事件驱动所有 cooldown 值 -1
       （下限 0，不清键，0 即无冷却）；NEUTRAL/EXPANSION/LEGACY completed 不递减。 */
  if (isEffectiveAdvancingType(event.type) && terminal === "completed") {
    const pairs = Object.entries(next.cooldowns);
    if (pairs.length > 0) {
      const ticked: Record<string, number> = {};
      let changed = false;
      for (const [key, value] of pairs) {
        const nextValue = Math.max(0, value - 1);
        ticked[key] = nextValue;
        if (nextValue !== value) changed = true;
      }
      next.cooldowns = ticked;
      if (changed) reasons.push("cooldown_ticked");
    }
  }

  /* 8) 加玩激活：仅 Host 在结算点显式选择，整局最多一次（R3 §三.3） */
  if (event.type === "EXTENSION_ACTIVATED_BY_HOST" && !next.extensionActivated) {
    next.extensionActivated = true;
    reasons.push("extension_activated");
  }

  /* 9) mutual due：四条件全满足才标记并累计一轮 regular run；
       任一不满足直接返回（不 push mutual_due，不标记）。口径见 mutualDueGates。 */
  if (event.type === "SYSTEM_MUTUAL_CHECK_DUE") {
    const dueCount = event.dueCount ?? next.relationshipEffectiveCardCount;
    if (mutualDueGates(next, dueCount)) {
      next.lastMutualCheckAtEffectiveCount = dueCount;
      next.regularMutualCheckRuns = next.regularMutualCheckRuns + 1;
      reasons.push("mutual_due");
    }
  }

  /* 10) MATCH 成型：COMPLETE/FINAL 且双方同意 → 建 match + 设 cooldown
       D5：建新 MATCH 前原子校验双方 active MATCH 数均 <2，达上限中性 no-action。 */
  const matchSignal =
    event.type === "SYSTEM_MUTUAL_CHECK_COMPLETE" ||
    event.type === "SYSTEM_MUTUAL_CHECK_FINAL";
  if (matchSignal && event.consented === true && event.pairKey && event.playerIds) {
    const alreadyMatched = next.matches[event.pairKey] !== undefined;
    if (mayCreateMatch(next.matches, event.playerIds, event.pairKey)) {
      if (!alreadyMatched) {
        next.matches = {
          ...next.matches,
          [event.pairKey]: {
            pairKey: event.pairKey,
            matchedAt: event.timestamp ?? "1970-01-01T00:00:00.000Z",
            playerIds: event.playerIds,
          },
        };
        reasons.push("match_created");
      }
      const curCooldown = next.cooldowns[event.pairKey] ?? 0;
      const upCooldown = Math.max(curCooldown, MINIMUM_EFFECTIVE_CARDS_BETWEEN_RUNS);
      if (upCooldown !== curCooldown) {
        next.cooldowns = { ...next.cooldowns, [event.pairKey]: upCooldown };
        reasons.push("cooldown_set");
      }
    }
  }

  return {
    state: next,
    delta: {
      ...baseDelta,
      applied: true,
      reasons,
      fromEffectiveCount: state.relationshipEffectiveCardCount,
      toEffectiveCount: next.relationshipEffectiveCardCount,
      fromHeat: state.heat,
      toHeat: next.heat,
    },
  };
}

export { createInitialRelationshipState } from "./v2-state";